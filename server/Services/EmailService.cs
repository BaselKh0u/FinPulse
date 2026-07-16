using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Server.Services
{
    public class EmailService
    {
        private readonly string _apiKey;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly string _publicBaseUrl;
        private readonly IHttpClientFactory _httpClientFactory;

        public EmailService(IConfiguration configuration, IHttpClientFactory httpClientFactory)
        {
            var section = configuration.GetSection("Resend");
            _apiKey = section["ApiKey"] ?? string.Empty;
            _fromEmail = section["FromEmail"] ?? "onboarding@resend.dev";
            _fromName = section["FromName"] ?? "FinPulse";
            _publicBaseUrl = (configuration["App:PublicBaseUrl"] ?? "http://localhost:5179").Trim().TrimEnd('/');
            _httpClientFactory = httpClientFactory;
        }

        private async Task SendEmailAsync(string toEmail, string subject, string htmlContent)
        {
            if (string.IsNullOrWhiteSpace(_apiKey))
            {
                Console.WriteLine("[EmailService] No API key configured, skipping email.");
                return;
            }

            var payload = JsonSerializer.Serialize(new
            {
                from = $"{_fromName} <{_fromEmail}>",
                to = new[] { toEmail },
                subject,
                html = htmlContent
            });

            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

            using var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                Console.WriteLine($"[EmailService] ERROR {(int)response.StatusCode}: {body}");
            else
                Console.WriteLine($"[EmailService] Email sent successfully to {toEmail}");
        }

        public async Task SendVerificationEmail(string toEmail, string token)
        {
            try
            {
                var verificationLink = $"{_publicBaseUrl}/api/Auth/verify-email?token={Uri.EscapeDataString(token)}";
                var html = $"""
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px;">
                      <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Welcome to FinPulse!</h2>
                        <p style="color: #444; font-size: 15px;">Thanks for signing up. Please verify your email address to get started.</p>
                        <a href="{verificationLink}"
                           style="display: inline-block; margin-top: 20px; padding: 12px 28px; background-color: #4f8ef7; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold;">
                          Verify Email
                        </a>
                        <p style="color: #888; font-size: 13px; margin-top: 28px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
                      </div>
                    </body>
                    </html>
                    """;
                await SendEmailAsync(toEmail, "Verify your FinPulse email", html);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] EXCEPTION while sending verification email: {ex.Message}");
            }
        }

        public async Task SendPasswordResetEmail(string toEmail)
        {
            try
            {
                var loginLink = $"{_publicBaseUrl}/auth/login";
                var html = $"""
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px;">
                      <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password reset requested</h2>
                        <p style="color: #444; font-size: 15px;">We received a request to reset your FinPulse password.</p>
                        <p style="color: #444; font-size: 15px;">Please use the in-app "Change Password" flow after logging in, or contact support if you are locked out.</p>
                        <a href="{loginLink}"
                           style="display: inline-block; margin-top: 20px; padding: 12px 28px; background-color: #4f8ef7; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold;">
                          Open FinPulse
                        </a>
                      </div>
                    </body>
                    </html>
                    """;
                await SendEmailAsync(toEmail, "FinPulse password reset request", html);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] EXCEPTION while sending reset email: {ex.Message}");
            }
        }
    }
}
