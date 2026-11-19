using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nutri.Data;

namespace Nutri.Controllers;

[ApiController, Authorize, Route("api")]
public sealed class NutritionController(NutriDb db) : ControllerBase
{
    private int AccountId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private IQueryable<Product> VisibleProducts =>
        db.Products.Where(product => product.AccountId == null || product.AccountId == AccountId);

    [HttpGet("products")]
    public async Task<IActionResult> Products()
    {
        return Ok(await VisibleProducts.OrderBy(product => product.Id).Select(product => new
        {
            product.Id, product.Name, product.Category, product.Calories, product.Protein, product.Fat, product.Carbs
        }).ToListAsync());
    }

    [HttpPost("products")]
    public async Task<IActionResult> AddProduct(ProductRequest request)
    {
        var product = new Product
        {
            AccountId = AccountId,
            Name = request.Name.Trim(),
            Category = "Мои продукты",
            Calories = request.Calories.GetValueOrDefault(),
            Protein = request.Protein,
            Fat = request.Fat,
            Carbs = request.Carbs
        };
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return StatusCode(201, new
        {
            product.Id, product.Name, product.Category, product.Calories, product.Protein, product.Fat, product.Carbs
        });
    }

    [HttpPost("meals")]
    public async Task<IActionResult> AddMeal(MealRequest request)
    {
        var product = await VisibleProducts.SingleOrDefaultAsync(product => product.Id == request.ProductId);
        if (product is null) return NotFound(new { message = "Продукт не найден" });

        db.Meals.Add(new Meal
        {
            AccountId = AccountId,
            ProductId = product.Id,
            Name = product.Name,
            EatenAtUtc = DateTime.UtcNow,
            Calories = product.Calories,
            Protein = product.Protein,
            Fat = product.Fat,
            Carbs = product.Carbs
        });
        await db.SaveChangesAsync();
        return StatusCode(201);
    }

    [HttpGet("diary")]
    public async Task<IActionResult> Diary([FromQuery] string? timeZone)
    {
        TimeZoneInfo zone;
        if (timeZone is null)
            zone = TimeZoneInfo.Utc;
        else if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out zone!))
            return BadRequest(new { message = "Неизвестный часовой пояс" });

        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone).Date;
        var weekStart = today.AddDays(-6);
        // Fetch a UTC window wide enough for local days, including clock changes.
        var startUtc = weekStart.AddDays(-1);
        var entries = await db.Meals.Where(meal => meal.AccountId == AccountId && meal.EatenAtUtc >= startUtc)
            .OrderByDescending(meal => meal.EatenAtUtc).ThenByDescending(meal => meal.Id).ToListAsync();

        var days = entries.ToLookup(meal => TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.SpecifyKind(meal.EatenAtUtc, DateTimeKind.Utc), zone).Date);
        var week = Enumerable.Range(0, 7).Select(index =>
        {
            var date = weekStart.AddDays(index);
            return new { Date = DateOnly.FromDateTime(date), Totals = Sum(days[date]) };
        }).ToArray();

        return Ok(new
        {
            Meals = days[today].Select(meal => new
            {
                meal.Id, meal.Name, meal.Calories, meal.Protein, meal.Fat, meal.Carbs,
                EatenAt = DateTime.SpecifyKind(meal.EatenAtUtc, DateTimeKind.Utc)
            }),
            Totals = week[^1].Totals,
            Week = week
        });
    }

    [HttpPut("goal")]
    public async Task<IActionResult> SaveGoal(GoalRequest request)
    {
        if (request.Gender is not ("male" or "female") ||
            request.Activity is not (1.2m or 1.375m or 1.55m or 1.725m or 1.9m) ||
            request.Adjustment is not (-0.15m or 0m or 0.15m))
            return BadRequest(new { message = "Проверьте пол, активность и цель" });

        var baseRate = 10 * request.Weight + 6.25m * request.Height - 5 * request.Age +
            (request.Gender == "male" ? 5 : -161);
        var calories = Math.Round(baseRate * request.Activity * (1 + request.Adjustment));
        var goal = new Nutrients(calories, Math.Round(calories * 0.25m / 4),
            Math.Round(calories * 0.30m / 9), Math.Round(calories * 0.45m / 4));
        var account = await db.Accounts.FindAsync(AccountId);
        if (account is null) return Unauthorized();
        account.Goal = goal;
        await db.SaveChangesAsync();
        return Ok(goal);
    }

    private static Nutrients Sum(IEnumerable<Meal> meals)
    {
        decimal calories = 0, protein = 0, fat = 0, carbs = 0;
        foreach (var meal in meals)
        {
            calories += meal.Calories;
            protein += meal.Protein;
            fat += meal.Fat;
            carbs += meal.Carbs;
        }
        return new Nutrients(calories, protein, fat, carbs);
    }
}

public sealed record ProductRequest(
    [Required, StringLength(120)] string Name,
    [Required, Range(0, 1000)] decimal? Calories,
    [Range(0, 100)] decimal Protein,
    [Range(0, 100)] decimal Fat,
    [Range(0, 100)] decimal Carbs);

public sealed record MealRequest([Range(1, int.MaxValue)] int ProductId);

public sealed record GoalRequest(
    [Required] string Gender,
    [Range(18, 120)] int Age,
    [Range(100, 250)] decimal Height,
    [Range(30, 350)] decimal Weight,
    decimal Activity,
    decimal Adjustment);
