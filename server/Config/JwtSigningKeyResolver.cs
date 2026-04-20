using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Server.Config;

internal static class JwtSigningKeyResolver
{
    /// <summary>
    /// Dev-only fallback when SecretKey is unset (e.g. empty override in appsettings.Local.json).
    /// Must meet HS256 minimum key size expectations; never use in production.
    /// </summary>
    private const string DevelopmentFallbackKey =
        "FinPulse-dev-only-JWT-signing-key-do-not-use-in-production-min-32-chars!";

    internal static string Resolve(IConfiguration configuration, IHostEnvironment environment)
    {
        var key = FirstNonEmpty(
            configuration["JwtSettings:SecretKey"],
            Environment.GetEnvironmentVariable("JwtSettings__SecretKey"));

        if (!string.IsNullOrWhiteSpace(key))
        {
            return key.Trim();
        }

        if (environment.IsDevelopment())
        {
            return DevelopmentFallbackKey;
        }

        throw new InvalidOperationException(
            "JwtSettings:SecretKey is missing or empty. Add it to appsettings, appsettings.Local.json, user secrets, or set environment variable JwtSettings__SecretKey.");
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v))
            {
                return v.Trim();
            }
        }

        return null;
    }
}
