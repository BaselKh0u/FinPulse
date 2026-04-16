using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;
using System.Security.Claims;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class UserController : ControllerBase
{
    private readonly AppDbContext _context;

    public UserController(AppDbContext context)
    {
        _context = context;
    }

    private int GetUserId() => int.Parse(User.FindFirst("userId")!.Value);

    // GET: api/User/profile
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = GetUserId();

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new { message = "User not found." });

        return Ok(new
        {
            userId = user.UserId,
            fullName = user.FullName,
            email = user.Email,
            phone = user.Phone,
            avatarUrl = user.AvatarUrl,
            isVerified = user.IsVerified,
            createdAt = user.CreatedAt
        });
    }

    // GET: api/User/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetUserById(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found." });

        return Ok(new
        {
            userId = user.UserId,
            fullName = user.FullName,
            email = user.Email,
            phone = user.Phone,
            avatarUrl = user.AvatarUrl,
            isVerified = user.IsVerified,
            createdAt = user.CreatedAt
        });
    }

    // PATCH: api/User/profile
    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = GetUserId();

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new { message = "User not found." });

        if (request.FullName is not null)
            user.FullName = request.FullName;

        if (request.Phone is not null)
            user.Phone = request.Phone;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            userId = user.UserId,
            fullName = user.FullName,
            email = user.Email,
            phone = user.Phone,
            avatarUrl = user.AvatarUrl,
            isVerified = user.IsVerified,
            createdAt = user.CreatedAt
        });
    }

    // POST: api/User/avatar
    [HttpPost("avatar")]
    public async Task<IActionResult> UpdateAvatar([FromBody] UpdateAvatarRequest request)
    {
        var userId = GetUserId();

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return NotFound(new { message = "User not found." });

        user.AvatarUrl = request.AvatarUrl;
        await _context.SaveChangesAsync();

        return Ok(new { avatarUrl = user.AvatarUrl });
    }

    // GET: api/User/preferences
    [HttpGet("preferences")]
    public async Task<IActionResult> GetPreferences()
    {
        var userId = GetUserId();

        var prefs = await _context.UserPreferences.FirstOrDefaultAsync(up => up.UserId == userId);
        if (prefs == null)
            return NotFound(new { message = "Preferences not found." });

        return Ok(MapPreferences(prefs));
    }

    // PATCH: api/User/preferences
    [HttpPatch("preferences")]
    public async Task<IActionResult> UpdatePreferences([FromBody] UpdatePreferencesRequest request)
    {
        var userId = GetUserId();

        var prefs = await _context.UserPreferences.FirstOrDefaultAsync(up => up.UserId == userId);
        if (prefs == null)
            return NotFound(new { message = "Preferences not found." });

        if (request.PushNotifications is not null)
            prefs.PushNotifications = request.PushNotifications.Value;

        if (request.AlertSound is not null)
            prefs.AlertSound = request.AlertSound.Value;

        if (request.BiometricLogin is not null)
            prefs.BiometricLogin = request.BiometricLogin.Value;

        if (request.DarkMode is not null)
            prefs.DarkMode = request.DarkMode.Value;

        if (request.Currency is not null)
            prefs.Currency = request.Currency;

        if (request.RefreshInterval is not null)
            prefs.RefreshInterval = request.RefreshInterval.Value;

        await _context.SaveChangesAsync();

        return Ok(MapPreferences(prefs));
    }

    // POST: api/User/device-token
    [HttpPost("device-token")]
    public async Task<IActionResult> RegisterDeviceToken([FromBody] DeviceTokenRequest request)
    {
        var userId = GetUserId();

        var existing = await _context.DeviceTokens
            .FirstOrDefaultAsync(dt => dt.UserId == userId && dt.ExpoPushToken == request.ExpoPushToken);

        if (existing is not null)
        {
            existing.Platform = request.Platform;
        }
        else
        {
            _context.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                ExpoPushToken = request.ExpoPushToken,
                Platform = request.Platform
            });
        }

        await _context.SaveChangesAsync();

        return Ok(new { message = "Device token registered." });
    }

    private static object MapPreferences(UserPreferences prefs) => new
    {
        pushNotifications = prefs.PushNotifications,
        alertSound = prefs.AlertSound,
        biometricLogin = prefs.BiometricLogin,
        darkMode = prefs.DarkMode,
        currency = prefs.Currency,
        refreshInterval = prefs.RefreshInterval
    };
}

public record UpdateProfileRequest(string? FullName, string? Phone);
public record UpdateAvatarRequest(string AvatarUrl);
public record UpdatePreferencesRequest(
    bool? PushNotifications,
    bool? AlertSound,
    bool? BiometricLogin,
    bool? DarkMode,
    string? Currency,
    int? RefreshInterval
);
public record DeviceTokenRequest(string ExpoPushToken, string Platform);
