using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Server.Data;
using Server.Models;

[Route("api/[controller]")]
[ApiController]
public class StockController : ControllerBase
{
    private readonly AppDbContext _context;

    public StockController(AppDbContext context)
    {
        _context = context;
    }

    // GET: api/Stock
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Stock>>> GetStocks()
    {
        return await _context.Stocks.ToListAsync();
    }

    // POST: api/Stock
    [HttpPost]
    public async Task<IActionResult> CreateStock(Stock stock)
    {
        if (await _context.Stocks.AnyAsync(s => s.Symbol == stock.Symbol))
        {
            return BadRequest(new { message = "Stock with this symbol already exists." });
        }

        _context.Stocks.Add(stock);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Stock added successfully.", stockId = stock.StockId });
    }
}