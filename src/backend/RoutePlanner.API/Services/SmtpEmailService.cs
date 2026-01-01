using MailKit.Net.Smtp;
using MimeKit;

namespace RoutePlanner.API.Services
{
    /// <summary>
    /// SMTP configuration settings
    /// </summary>
    public class SmtpSettings
    {
        public required string Host { get; set; }
        public int Port { get; set; }
        public bool EnableSsl { get; set; }
        public required string Username { get; set; }
        public required string Password { get; set; }
        public required string FromEmail { get; set; }
        public required string FromName { get; set; }
    }

    /// <summary>
    /// SMTP email service implementation using MailKit
    /// </summary>
    public class SmtpEmailService : IEmailService
    {
        private readonly SmtpSettings _smtpSettings;
        private readonly ILogger<SmtpEmailService> _logger;

        public SmtpEmailService(IConfiguration configuration, ILogger<SmtpEmailService> logger)
        {
            _smtpSettings = configuration.GetSection("SmtpSettings").Get<SmtpSettings>()
                ?? throw new InvalidOperationException("SmtpSettings not configured");
            _logger = logger;
        }

        public async Task SendEmailConfirmationAsync(string toEmail, string confirmationLink)
        {
            var subject = "Confirm your email - Roadtrip Route Planner";
            var body = $@"
                <html>
                <body style='font-family: Arial, sans-serif;'>
                    <h2 style='color: #2A9D8F;'>Welcome to Roadtrip Route Planner!</h2>
                    <p>Please confirm your email address by clicking the link below:</p>
                    <p><a href='{confirmationLink}' style='background-color: #2A9D8F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>Confirm Email</a></p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style='color: #666;'>{confirmationLink}</p>
                    <p>If you did not create an account, please ignore this email.</p>
                    <p style='color: #999; font-size: 12px;'>This link will expire in 24 hours.</p>
                </body>
                </html>
            ";

            await SendEmailAsync(toEmail, subject, body);
        }

        public async Task SendPasswordResetAsync(string toEmail, string resetLink)
        {
            var subject = "Reset your password - Roadtrip Route Planner";
            var body = $@"
                <html>
                <body style='font-family: Arial, sans-serif;'>
                    <h2 style='color: #2A9D8F;'>Password Reset Request</h2>
                    <p>You requested to reset your password. Click the link below to proceed:</p>
                    <p><a href='{resetLink}' style='background-color: #2A9D8F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>Reset Password</a></p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style='color: #666;'>{resetLink}</p>
                    <p>If you did not request this, please ignore this email. Your password will remain unchanged.</p>
                    <p style='color: #999; font-size: 12px;'>This link will expire in 1 hour.</p>
                </body>
                </html>
            ";

            await SendEmailAsync(toEmail, subject, body);
        }

        private async Task SendEmailAsync(string toEmail, string subject, string htmlBody)
        {
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(_smtpSettings.FromName, _smtpSettings.FromEmail));
                message.To.Add(new MailboxAddress(toEmail, toEmail));
                message.Subject = subject;

                var bodyBuilder = new BodyBuilder { HtmlBody = htmlBody };
                message.Body = bodyBuilder.ToMessageBody();

                using var client = new SmtpClient();
                await client.ConnectAsync(_smtpSettings.Host, _smtpSettings.Port, _smtpSettings.EnableSsl);
                await client.AuthenticateAsync(_smtpSettings.Username, _smtpSettings.Password);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                _logger.LogInformation("Email sent successfully to {Email}", toEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {Email}", toEmail);
                throw;
            }
        }
    }
}
