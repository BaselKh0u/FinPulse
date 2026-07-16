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
            user.PasswordResetToken = Guid.NewGuid().ToString();
            user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            await _context.SaveChangesAsync();

            await _emailService.SendPasswordResetEmail(user.Email, user.PasswordResetToken);
        }

        return Ok(new { message = "If this email exists, a reset link has been sent." });
    }

    // POST: api/Auth/reset-password
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return BadRequest(new { message = "Token and new password are required." });
        }

        if (request.NewPassword.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.PasswordResetToken == request.Token);

        if (user is null || string.IsNullOrEmpty(user.PasswordResetToken) ||
            user.PasswordResetTokenExpiry is null || user.PasswordResetTokenExpiry < DateTime.UtcNow)
        {
            return BadRequest(new { message = "This reset link is invalid or has expired." });
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
        user.PasswordResetToken = string.Empty;
        user.PasswordResetTokenExpiry = null;
        await _context.SaveChangesAsync();

        return Ok(new { message = "Password reset successfully." });
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

    // GET: api/Auth/reset-password-page?token={token}
    // Web-hosted reset form — works from any device (no app install / URL-scheme requirements),
    // unlike a mobile:// deep link which Expo Go can't register.
    [HttpGet("reset-password-page")]
    public async Task<ContentResult> ResetPasswordPage([FromQuery] string token)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.PasswordResetToken == token);
        if (user is null || string.IsNullOrEmpty(user.PasswordResetToken) ||
            user.PasswordResetTokenExpiry is null || user.PasswordResetTokenExpiry < DateTime.UtcNow)
        {
            return new ContentResult
            {
                ContentType = "text/html",
                StatusCode = 400,
                Content = """
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 60px;">
                      <h2 style="color: #e53e3e;">Reset Link Invalid</h2>
                      <p>This password reset link is invalid or has expired. Please request a new one from the app.</p>
                    </body>
                    </html>
                    """
            };
        }

        var safeToken = System.Net.WebUtility.HtmlEncode(token);
        return new ContentResult
        {
            ContentType = "text/html",
            StatusCode = 200,
            Content = $$"""
                <!DOCTYPE html>
                <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                </head>
                <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px;">
                  <div style="max-width: 420px; margin: auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <h2 style="color: #1a1a2e; margin-bottom: 8px;">Reset your password</h2>
                    <p style="color: #444; font-size: 14px;">Choose a new password for your FinPulse account. It must be at least 8 characters and include a letter and a number.</p>
                    <form id="resetForm">
                      <input type="hidden" id="token" value="{{safeToken}}" />
                      <label style="display:block; font-size:13px; color:#333; margin-top:16px;">New password</label>
                      <input type="password" id="newPassword" required minlength="8" style="width:100%; box-sizing:border-box; padding:10px; margin-top:6px; border-radius:6px; border:1px solid #ccc; font-size:15px;" />
                      <label style="display:block; font-size:13px; color:#333; margin-top:14px;">Confirm password</label>
                      <input type="password" id="confirmPassword" required minlength="8" style="width:100%; box-sizing:border-box; padding:10px; margin-top:6px; border-radius:6px; border:1px solid #ccc; font-size:15px;" />
                      <button type="submit" style="margin-top:22px; width:100%; padding:12px; background-color:#4f8ef7; color:#fff; border:none; border-radius:6px; font-size:15px; font-weight:bold; cursor:pointer;">Reset Password</button>
                    </form>
                    <p id="message" style="margin-top:16px; font-size:14px;"></p>
                  </div>
                  <script>
                    document.getElementById('resetForm').addEventListener('submit', async function (e) {
                      e.preventDefault();
                      var newPassword = document.getElementById('newPassword').value;
                      var confirmPassword = document.getElementById('confirmPassword').value;
                      var messageEl = document.getElementById('message');
                      messageEl.style.color = '#e53e3e';
                      if (newPassword !== confirmPassword) {
                        messageEl.textContent = 'Passwords do not match.';
                        return;
                      }
                      try {
                        var res = await fetch('/api/Auth/reset-password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: document.getElementById('token').value, newPassword: newPassword })
                        });
                        var data = await res.json();
                        if (res.ok) {
                          messageEl.style.color = '#38a169';
                          messageEl.textContent = 'Password reset successfully. You can close this page and log in.';
                          document.getElementById('resetForm').style.display = 'none';
                        } else {
                          messageEl.textContent = data.message || 'Something went wrong.';
                        }
                      } catch (err) {
                        messageEl.textContent = 'Network error. Please try again.';
                      }
                    });
                  </script>
                </body>
                </html>
                """
        };
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
public record ResetPasswordRequest(string Token, string NewPassword);
public record ChangePasswordRequest(string OldPassword, string NewPassword);
