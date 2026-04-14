using SendGrid;
using SendGrid.Helpers.Mail;

namespace Server.Services
{
    public class EmailService
    {
        private readonly string _apiKey;
        private readonly string _fromEmail;
        private readonly string _fromName;

        public EmailService(IConfiguration configuration)
        {
            var section = configuration.GetSection("SendGrid");
            _apiKey = section["ApiKey"]!;
            _fromEmail = section["FromEmail"]!;
            _fromName = section["FromName"]!;
        }

        public async Task SendVerificationEmail(string toEmail, string token)
        {
            try
            {
                Console.WriteLine($"[EmailService] Sending verification email to {toEmail}");

                var client = new SendGridClient(_apiKey);
                var from = new EmailAddress(_fromEmail, _fromName);
                var to = new EmailAddress(toEmail);
                var subject = "Verify your FinPulse email";

                var verificationLink = $"https://localhost:7173/api/Auth/verify-email?token={token}";

                var htmlContent = $"""
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

                var msg = MailHelper.CreateSingleEmail(from, to, subject, plainTextContent: null, htmlContent: htmlContent);
                var response = await client.SendEmailAsync(msg);

                var body = await response.Body.ReadAsStringAsync();
                Console.WriteLine($"[EmailService] SendGrid status: {(int)response.StatusCode} {response.StatusCode}");
                if (!string.IsNullOrWhiteSpace(body))
                    Console.WriteLine($"[EmailService] SendGrid response body: {body}");

                if ((int)response.StatusCode >= 400)
                    Console.WriteLine($"[EmailService] ERROR — email was NOT sent. Check API key, sender verification, and the response body above.");
                else
                    Console.WriteLine($"[EmailService] Email sent successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] EXCEPTION while sending email: {ex.Message}");
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
