using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public class UserPreferences
    {
        [Key]
        public int UserPreferencesId { get; set; }

        public int UserId { get; set; }

        public bool PushNotifications { get; set; } = true;
        public bool AlertSound { get; set; } = true;
        public bool BiometricLogin { get; set; } = false;
        public bool DarkMode { get; set; } = false;
        public string Currency { get; set; } = "USD";
        public int RefreshInterval { get; set; } = 30;

        public User User { get; set; } = null!;
    }
}
