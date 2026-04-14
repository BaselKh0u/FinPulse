using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;

[Route("api/[controller]")]
[ApiController]
public class UserController : ControllerBase
{
    private readonly AppDbContext _context;
    private static readonly Dictionary<int, UserPreferencesDto> PreferencesByUserId = new();

    public UserController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile([FromQuery] int userId)
    {
        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId <= 0)
        {
            return BadRequest(new { message = "Missing user id." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == resolvedUserId);
        if (user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        var names = SplitName(user.FullName);
        return Ok(new
        {
            id = user.UserId.ToString(),
            firstName = names.firstName,
            lastName = names.lastName,
            email = user.Email,
            phone = (string?)null,
            joinedAt = user.CreatedAt,
            isVerified = true,
            token = "server-session"
        });
    }

    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile([FromQuery] int userId, [FromBody] UpdateProfileDto request)
    {
        var resolvedUserId = ResolveUserId(userId);
        var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == resolvedUserId);
        if (user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        var first = string.IsNullOrWhiteSpace(request.FirstName) ? SplitName(user.FullName).firstName : request.FirstName.Trim();
        var last = string.IsNullOrWhiteSpace(request.LastName) ? SplitName(user.FullName).lastName : request.LastName.Trim();
        user.FullName = $"{first} {last}".Trim();

        await _context.SaveChangesAsync();
        return await GetProfile(resolvedUserId);
    }

    [HttpGet("preferences")]
    public IActionResult GetPreferences([FromQuery] int userId)
    {
        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId <= 0)
        {
            return BadRequest(new { message = "Missing user id." });
        }

        if (!PreferencesByUserId.TryGetValue(resolvedUserId, out var prefs))
        {
            prefs = new UserPreferencesDto();
            PreferencesByUserId[resolvedUserId] = prefs;
        }

        return Ok(prefs);
    }

    [HttpPatch("preferences")]
    public IActionResult UpdatePreferences([FromQuery] int userId, [FromBody] UserPreferencesDto patch)
    {
        var resolvedUserId = ResolveUserId(userId);
        if (resolvedUserId <= 0)
        {
            return BadRequest(new { message = "Missing user id." });
        }

        if (!PreferencesByUserId.TryGetValue(resolvedUserId, out var prefs))
        {
            prefs = new UserPreferencesDto();
        }

        prefs.PushNotifications = patch.PushNotifications;
        prefs.AlertSound = patch.AlertSound;
        prefs.BiometricLogin = patch.BiometricLogin;
        prefs.DarkMode = patch.DarkMode;
        prefs.Currency = string.IsNullOrWhiteSpace(patch.Currency) ? prefs.Currency : patch.Currency;
        prefs.RefreshInterval = string.IsNullOrWhiteSpace(patch.RefreshInterval) ? prefs.RefreshInterval : patch.RefreshInterval;
        PreferencesByUserId[resolvedUserId] = prefs;

        return Ok(prefs);
    }

    private int ResolveUserId(int userIdFromQuery)
    {
        if (userIdFromQuery > 0)
        {
            return userIdFromQuery;
        }

        if (Request.Headers.TryGetValue("X-User-Id", out var headerValue) &&
            int.TryParse(headerValue.ToString(), out var headerId))
        {
            return headerId;
        }

        return 0;
    }

    private static (string firstName, string lastName) SplitName(string fullName)
    {
        var parts = (fullName ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return ("User", string.Empty);
        }

        if (parts.Length == 1)
        {
            return (parts[0], string.Empty);
        }

        return (parts[0], string.Join(' ', parts.Skip(1)));
    }

    public class UpdateProfileDto
    {
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Phone { get; set; }
    }

    public class UserPreferencesDto
    {
        public bool PushNotifications { get; set; } = true;
        public bool AlertSound { get; set; } = true;
        public bool BiometricLogin { get; set; }
        public bool DarkMode { get; set; }
        public string Currency { get; set; } = "USD";
        public string RefreshInterval { get; set; } = "30s";
    }
}
