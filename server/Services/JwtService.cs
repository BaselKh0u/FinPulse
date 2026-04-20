using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Server.Config;

namespace Server.Services
{
    public class JwtService
    {
        private readonly IConfiguration _configuration;
        private readonly IHostEnvironment _environment;

        public JwtService(IConfiguration configuration, IHostEnvironment environment)
        {
            _configuration = configuration;
            _environment = environment;
        }

        public string GenerateToken(int userId, string email, string fullName)
        {
            var secretKey = JwtSigningKeyResolver.Resolve(_configuration, _environment);
            var issuer = _configuration["JwtSettings:Issuer"]!;
            var audience = _configuration["JwtSettings:Audience"]!;
            var expiryInMinutes = int.Parse(_configuration["JwtSettings:ExpiryInMinutes"]!);

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim("userId", userId.ToString()),
                new Claim(ClaimTypes.Email, email),
                new Claim("fullName", fullName)
            };

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(expiryInMinutes),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
