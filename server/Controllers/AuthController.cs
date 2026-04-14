using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;

[Route("api/[controller]")]
[Route("auth")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;

    public AuthController(AppDbContext context)
    {
        _context = context;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        if (await _context.Users.AnyAsync(u => u.Email == email))
        {
            return BadRequest(new { message = "A user with this email already exists." });
        }

        var firstName = (request.FirstName ?? string.Empty).Trim();
        var lastName = (request.LastName ?? string.Empty).Trim();
        var fullName = $"{firstName} {lastName}".Trim();

        var user = new User
        {
            Email = email,
            FullName = string.IsNullOrWhiteSpace(fullName) ? email : fullName,
            PasswordHash = HashPassword(request.Password)
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            token = BuildToken(user.UserId),
            userId = user.UserId
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var email = (request.Email ?? string.Empty).Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user == null || user.PasswordHash != HashPassword(request.Password ?? string.Empty))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        return Ok(new
        {
            token = BuildToken(user.UserId),
            userId = user.UserId
        });
    }

    [HttpPost("forgot-password")]
    public IActionResult ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        return Ok(new
        {
            message = "If that email exists, a reset link has been sent.",
            email = request.Email
        });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = ResolveUserIdFromAuthHeader();
        if (userId <= 0)
        {
            return Unauthorized(new { message = "Missing or invalid Authorization token." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (user.PasswordHash != HashPassword(request.OldPassword ?? string.Empty))
        {
            return BadRequest(new { message = "Old password is incorrect." });
        }

        user.PasswordHash = HashPassword(request.NewPassword ?? string.Empty);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Password updated." });
    }

    [HttpPost("verify-email")]
    [HttpGet("verify-email")]
    public IActionResult VerifyEmail()
    {
        return Ok(new { verified = true });
    }

    [HttpDelete("delete-account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var userId = ResolveUserIdFromAuthHeader();
        if (userId <= 0)
        {
            return Unauthorized(new { message = "Missing or invalid Authorization token." });
        }

        _context.Alerts.RemoveRange(_context.Alerts.Where(a => a.UserId == userId));
        _context.AlertEvents.RemoveRange(_context.AlertEvents.Where(a => a.UserId == userId));
        _context.Watchlists.RemoveRange(_context.Watchlists.Where(w => w.UserId == userId));

        var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
        if (user != null)
        {
            _context.Users.Remove(user);
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "Account deleted." });
    }

    [HttpPost("logout")]
    public IActionResult Logout() => Ok(new { message = "Logged out." });

    private int ResolveUserIdFromAuthHeader()
    {
        if (!Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            return 0;
        }

        var token = authHeader.ToString().Replace("Bearer ", string.Empty).Trim();
        return token.StartsWith("server-session-", StringComparison.OrdinalIgnoreCase)
            && int.TryParse(token["server-session-".Length..], out var userId)
            ? userId
            : 0;
    }

    private static string BuildToken(int userId) => $"server-session-{userId}";

    private static string HashPassword(string password)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
        return Convert.ToHexString(bytes);
    }

    public sealed class RegisterRequest
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class ForgotPasswordRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public sealed class ChangePasswordRequest
    {
        public string OldPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }
}