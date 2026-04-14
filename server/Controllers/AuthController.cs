using Microsoft.AspNetCore.Mvc;
using Server.Data;
using Server.Models;
using Microsoft.EntityFrameworkCore;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;

    public AuthController(AppDbContext context)
    {
        _context = context;
    }

    // POST: api/Auth/register
    [HttpPost("register")]
    public async Task<IActionResult> Register(User user)
    {
        if (await _context.Users.AnyAsync(u => u.Email == user.Email))
        {
            return BadRequest(new { message = "Registration failed: A user with this email address already exists." });
        }

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return Ok(new { message = "User registered successfully." });
    }

    // POST: api/Auth/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] User loginData)
    {
        // Find the user by email
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == loginData.Email);

        // If user doesn't exist or password doesn't match
        if (user == null || user.PasswordHash != loginData.PasswordHash)
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        // Success response
        return Ok(new
        {
            message = "Login successful.",
            token = "server-session",
            userId = user.UserId,
            fullName = user.FullName
        });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        return Ok(new { message = "Logged out." });
    }
}