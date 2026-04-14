using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public class DeviceToken
    {
        [Key]
        public int DeviceTokenId { get; set; }

        public int UserId { get; set; }

        [Required]
        public string ExpoPushToken { get; set; } = string.Empty;

        [Required]
        public string Platform { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public User User { get; set; } = null!;
    }
}
