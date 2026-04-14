using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Server.BackgroundJobs;
using Server.Config;
using Server.Data;
using Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .WithOrigins("http://localhost:8081", "http://127.0.0.1:8081")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.Configure<AlphaVantageOptions>(builder.Configuration.GetSection(AlphaVantageOptions.SectionName));
builder.Services.AddHttpClient<IStockIngestionService, AlphaVantageStockIngestionService>();
builder.Services.AddScoped<IAlertEvaluationService, AlertEvaluationService>();
builder.Services.AddHostedService<StockIngestionJob>();
builder.Services.AddHostedService<AlertTriggerJob>();

var app = builder.Build();

// Swagger: off only in Production unless Swagger:Enabled is explicitly true (avoids 404 when env is not Development).
var enableSwagger = !app.Environment.IsProduction()
    || app.Configuration.GetValue<bool>("Swagger:Enabled");
if (enableSwagger)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("FrontendDev");

// HTTP-only profiles (e.g. launch "http") have no HTTPS URL; redirect then warns and can break /swagger.
var urls = app.Configuration["ASPNETCORE_URLS"]
    ?? Environment.GetEnvironmentVariable("ASPNETCORE_URLS")
    ?? string.Empty;
if (urls.Contains("https://", StringComparison.OrdinalIgnoreCase))
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();

app.MapControllers();

if (enableSwagger)
{
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        var server = app.Services.GetService<IServer>();
        var addresses = server?.Features.Get<IServerAddressesFeature>()?.Addresses;
        if (addresses is { Count: > 0 })
        {
            foreach (var baseUrl in addresses)
                app.Logger.LogInformation("Swagger UI: {SwaggerUrl}", $"{baseUrl.TrimEnd('/')}/swagger");
        }
    });
}

app.Run();
