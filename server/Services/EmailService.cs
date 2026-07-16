using Resend;

namespace Server.Services
{
    public class EmailService
    {
        private readonly IResend _resend;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly string _publicBaseUrl;

        public EmailService(IResend resend, IConfiguration configuration)
        {
            _resend = resend;
            var section = configuration.GetSection("Resend");
            _fromEmail = section["FromEmail"] ?? "onboarding@resend.dev";
            _fromName = section["FromName"] ?? "FinPulse";
            _publicBaseUrl = (configuration["App:PublicBaseUrl"] ?? "http://localhost:5179").Trim().TrimEnd('/');
        }

        public async Task SendVerificationEmail(string toEmail, string token)
        {
            try
            {
                Console.WriteLine($"[EmailService] Sending verification email to {toEmail}");

                var verificationLink = $"{_publicBaseUrl}/api/Auth/verify-email?token={Uri.EscapeDataString(token)}";

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

                var message = new EmailMessage
                {
                    From = new EmailAddress { Email = _fromEmail, DisplayName = _fromName },
                    Subject = "Verify your FinPulse email",
                    HtmlBody = htmlContent,
                };
                message.To.Add(toEmail);

                var response = await _resend.EmailSendAsync(message);
                Console.WriteLine($"[EmailService] Email sent successfully. Resend id: {response.Content}");
            }
            catch (ResendException ex)
            {
                Console.WriteLine($"[EmailService] ERROR — email was NOT sent. Status: {ex.StatusCode}, Type: {ex.ErrorType}, Message: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] EXCEPTION while sending email: {ex.Message}");
                Console.WriteLine(ex.ToString());
            }
        }

        public async Task SendPasswordResetEmail(string toEmail, string token)
        {
            try
            {
                Console.WriteLine($"[EmailService] Sending password reset email to {toEmail}");

                var resetLink = $"{_publicBaseUrl}/api/Auth/reset-password-page?token={Uri.EscapeDataString(token)}";

                var htmlContent = $"""
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px;">
                      <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password reset requested</h2>
                        <p style="color: #444; font-size: 15px;">
                          We received a request to reset your FinPulse password. Tap the button below to choose a new one.
                        </p>
                        <a href="{resetLink}"
                           style="display: inline-block; margin-top: 20px; padding: 12px 28px; background-color: #4f8ef7; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: bold;">
                          Reset Password
                        </a>
                        <p style="color: #888; font-size: 13px; margin-top: 28px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
                      </div>
                    </body>
                    </html>
                    """;

                var message = new EmailMessage
                {
                    From = new EmailAddress { Email = _fromEmail, DisplayName = _fromName },
                    Subject = "FinPulse password reset request",
                    HtmlBody = htmlContent,
                };
                message.To.Add(toEmail);

                var response = await _resend.EmailSendAsync(message);
                Console.WriteLine($"[EmailService] Email sent successfully. Resend id: {response.Content}");
            }
            catch (ResendException ex)
            {
                Console.WriteLine($"[EmailService] ERROR — email was NOT sent. Status: {ex.StatusCode}, Type: {ex.ErrorType}, Message: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] EXCEPTION while sending reset email: {ex.Message}");
                Console.WriteLine(ex.ToString());
            }
        }
    }
}
