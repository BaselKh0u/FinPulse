using System.ComponentModel.DataAnnotations;

namespace Server.Models
{
    public class Stock
    {
        [Key]
        public int StockId { get; set; } // PK

        [Required(ErrorMessage = "Stock symbol is required")]
        public string Symbol { get; set; } = string.Empty; // (Unique)

        [Required(ErrorMessage = "Company name is required")]
        public string CompanyName { get; set; } = string.Empty;
        public string Sector { get; set; } = string.Empty;
    }
}
