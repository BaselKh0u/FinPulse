using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;
using Server.Services;
using System.Security.Claims;

[Route("api/[controller]")]
[Route("auth")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly JwtService _jwtService;
    private readonly EmailService _emailService;

    public AuthController(AppDbContext context, JwtService jwtService, EmailService emailService)
    {
        _context = context;
        _jwtService = jwtService;
        _emailService = emailService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) ||
            string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail))
        {
            return BadRequest(new { message = "An account with this email already exists." });
        }

        var verificationToken = Guid.NewGuid().ToString();

        var user = new User
        {
            FullName = request.FullName,
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            EmailVerificationToken = verificationToken,
            EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24)
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        _context.UserPreferences.Add(new UserPreferences { UserId = user.UserId });
        await _context.SaveChangesAsync();

        await _emailService.SendVerificationEmail(user.Email, verificationToken);

        var token = _jwtService.GenerateToken(user.UserId, user.Email, user.FullName);

        return Ok(new
        {
            token,
            userId = user.UserId,
            fullName = user.FullName
        });
    }

    // POST: api/Auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        var token = _jwtService.GenerateToken(user.UserId, user.Email, user.FullName);

        return Ok(new
        {
            token,
            userId = user.UserId,
            fullName = user.FullName
        });
    }

    // POST: api/Auth/forgot-password
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (user is not null)
        {
            await _emailService.SendPasswordResetEmail(user.Email);
        }

        return Ok(new { message = "If this email exists, a reset link has been sent." });
    }

    // POST: api/Auth/resend-verification
    [Authorize]
    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerificationEmail()
    {
        var userId = int.Parse(User.FindFirst("userId")!.Value);
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return Unauthorized(new { message = "User not found." });
        }

        if (user.IsVerified)
        {
            return Ok(new { message = "Your email is already verified." });
        }

        user.EmailVerificationToken = Guid.NewGuid().ToString();
        user.EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24);
        await _context.SaveChangesAsync();

        await _emailService.SendVerificationEmail(user.Email, user.EmailVerificationToken);
        return Ok(new { message = "Verification email sent." });
    }

    // POST: api/Auth/change-password
    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = int.Parse(User.FindFirst("userId")!.Value);

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return Unauthorized(new { message = "User not found." });

        if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
            return BadRequest(new { message = "Current password is incorrect." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Password changed successfully." });
    }

    // DELETE: api/Auth/delete-account
    [Authorize]
    [HttpDelete("delete-account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var userId = int.Parse(User.FindFirst("userId")!.Value);

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return Unauthorized(new { message = "User not found." });

        // Explicitly delete related records before removing the user
        await _context.UserPreferences.Where(up => up.UserId == userId).ExecuteDeleteAsync();
        await _context.Watchlists.Where(w => w.UserId == userId).ExecuteDeleteAsync();
        await _context.Alerts.Where(a => a.UserId == userId).ExecuteDeleteAsync();
        await _context.DeviceTokens.Where(dt => dt.UserId == userId).ExecuteDeleteAsync();

        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Account deleted successfully." });
    }

    // POST: api/Auth/logout
    [Authorize]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        // JWT is stateless — the client is responsible for discarding the token
        return Ok(new { message = "Logged out successfully." });
    }

    // GET: api/Auth/verify-email?token={token}
    [HttpGet("verify-email")]
    public async Task<ContentResult> VerifyEmail([FromQuery] string token)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.EmailVerificationToken == token);

        if (user == null || user.EmailVerificationTokenExpiry < DateTime.UtcNow)
        {
            return new ContentResult
            {
                ContentType = "text/html",
                StatusCode = 400,
                Content = """
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 60px;">
                      <h2 style="color: #e53e3e;">Verification Failed</h2>
                      <p>This verification link is invalid or has expired.</p>
                    </body>
                    </html>
                    """
            };
        }

        user.IsVerified = true;
        user.EmailVerificationToken = string.Empty;
        user.EmailVerificationTokenExpiry = null;
        await _context.SaveChangesAsync();

        return new ContentResult
        {
            ContentType = "text/html",
            StatusCode = 200,
            Content = """
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 60px;">
                  <h2 style="color: #38a169;">Email Verified Successfully!</h2>
                  <p>Your email has been verified. You can close this page.</p>
                </body>
                </html>
                """
        };
    }
}

public record RegisterRequest(string FullName, string Email, string Password);
public record LoginRequest(string Email, string Password);
public record ForgotPasswordRequest(string Email);
public record ChangePasswordRequest(string OldPassword, string NewPassword);
