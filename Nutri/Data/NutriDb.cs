using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Nutri.Data;

public sealed class NutriDb(DbContextOptions<NutriDb> options) : DbContext(options)
{
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Meal> Meals => Set<Meal>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Account>().HasIndex(account => account.Email).IsUnique();
        model.Entity<Account>().OwnsOne(account => account.Goal);
        model.Entity<Product>().HasOne<Account>().WithMany().HasForeignKey(product => product.AccountId);
        model.Entity<Meal>().HasOne<Account>().WithMany().HasForeignKey(meal => meal.AccountId);
        model.Entity<Meal>().HasOne<Product>().WithMany().HasForeignKey(meal => meal.ProductId);
        model.Entity<Meal>().HasIndex(meal => new { meal.AccountId, meal.EatenAtUtc });
        using var catalog = typeof(NutriDb).Assembly.GetManifestResourceStream("Nutri.Data.catalog.json")!;
        var products = JsonSerializer.Deserialize<Product[]>(catalog, JsonSerializerOptions.Web)!;
        model.Entity<Product>().HasData(products);
    }
}

public sealed class Account
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public bool MealReminders { get; set; }
    public bool WeeklyReport { get; set; }
    public bool NutritionTips { get; set; }
    public Nutrients? Goal { get; set; }
}

public sealed record Nutrients(decimal Calories, decimal Protein, decimal Fat, decimal Carbs);

public sealed class Product
{
    public int Id { get; set; }
    public int? AccountId { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public decimal Calories { get; set; }
    public decimal Protein { get; set; }
    public decimal Fat { get; set; }
    public decimal Carbs { get; set; }
}

public sealed class Meal
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public int ProductId { get; set; }
    public DateTime EatenAtUtc { get; set; }
    public string Name { get; set; } = "";
    public decimal Calories { get; set; }
    public decimal Protein { get; set; }
    public decimal Fat { get; set; }
    public decimal Carbs { get; set; }
}
