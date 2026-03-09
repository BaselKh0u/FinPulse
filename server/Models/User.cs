namespace Server.Models
{
    public class User
    {
        public int UserId { get; set; } // PK
        public string FullName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty; // Unique
        public string PasswordHash { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
