using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;

var builder = WebApplication.CreateBuilder(args);

// Services hinzufügen
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// In-Memory Database (für Entwicklung)
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseInMemoryDatabase("RoutePlannerDb"));

// CORS für Frontend
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
//app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

// Database initialisieren
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    context.Database.EnsureCreated();
}

app.Run();