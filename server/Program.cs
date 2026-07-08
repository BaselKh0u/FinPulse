using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Server.BackgroundJobs;
using Server.Config;
using Server.Data;
using Server.Services;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Optional machine-only overrides (never committed): copy appsettings.Local.json.example → appsettings.Local.json
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token. Example: eyJhbGci..."
    };

    options.AddSecurityDefinition("BearerAuth", scheme);

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "BearerAuth" }
            },
            Array.Empty<string>()
        }
    });
});
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.Configure<AlphaVantageOptions>(builder.Configuration.GetSection(AlphaVantageOptions.SectionName));
builder.Services.AddHttpClient(StockMarketDataService.YahooHttpClientName, client =>
{
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
    client.Timeout = TimeSpan.FromSeconds(35);
});
builder.Services.AddScoped<IStockMarketDataService, StockMarketDataService>();
builder.Services.AddHttpClient(nameof(ExpoPushNotificationService), client =>
{
    client.Timeout = TimeSpan.FromSeconds(25);
    client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "FinPulse-ingestion/1.0");
});
builder.Services.AddScoped<IPushNotificationService, ExpoPushNotificationService>();
builder.Services.AddSingleton<SymbolIngestionRotationState>();
builder.Services.AddSingleton<AlphaVantageSymbolSearchThrottle>();
builder.Services.AddHttpClient(nameof(RedditOAuthTokenProvider));
builder.Services.AddSingleton<IRedditOAuthTokenProvider, RedditOAuthTokenProvider>();
builder.Services.AddHttpClient<IStockIngestionService, AlphaVantageStockIngestionService>(client =>
{
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");
    client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    client.Timeout = TimeSpan.FromSeconds(35);
});
builder.Services.AddHttpClient(VaderSentimentService.HttpClientName, client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["SentimentService:BaseUrl"] ?? "http://localhost:8765");
    client.Timeout = TimeSpan.FromSeconds(5); // fast fallback if Python isn't running
});
builder.Services.AddScoped<IVaderSentimentService, VaderSentimentService>();
builder.Services.AddScoped<IAlertEvaluationService, AlertEvaluationService>();
builder.Services.AddHostedService<StockQuoteIngestionJob>();
var avSection = builder.Configuration.GetSection(AlphaVantageOptions.SectionName);
if (avSection.GetValue("RunExtendedIngestionJob", defaultValue: true))
{
    builder.Services.AddHostedService<StockExtendedIngestionJob>();
}

builder.Services.AddHostedService<AlertTriggerJob>();
builder.Services.AddHostedService<WatchlistRealtimeQuoteJob>();

builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<EmailService>();

var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var jwtSigningKey = JwtSigningKeyResolver.Resolve(builder.Configuration, builder.Environment);
if (builder.Environment.IsDevelopment()
    && string.IsNullOrWhiteSpace(jwtSettings["SecretKey"]?.Trim())
    && string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("JwtSettings__SecretKey")))
{
    Console.WriteLine(
        "[FinPulse] JwtSettings:SecretKey is empty — using the built-in Development signing key. " +
        "Set SecretKey in appsettings.Local.json (or JwtSettings__SecretKey) so tokens stay consistent across restarts.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidAudience = jwtSettings["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey))
        };
    });

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

app.UseAuthentication();
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
