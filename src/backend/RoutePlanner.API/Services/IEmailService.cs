namespace RoutePlanner.API.Services
{
    /// <summary>
    /// Email service interface for sending authentication emails
    /// </summary>
    public interface IEmailService
    {
        /// <summary>
        /// Send email confirmation link to user
        /// </summary>
        Task SendEmailConfirmationAsync(string toEmail, string confirmationLink);

        /// <summary>
        /// Send password reset link to user
        /// </summary>
        Task SendPasswordResetAsync(string toEmail, string resetLink);
    }
}
