using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Nutri.Data;

namespace Nutri.Controllers;

[ApiController, Authorize, Route("api/account")]
public sealed class AccountController(NutriDb db, IPasswordHasher<Account> hasher) : ControllerBase
{
    [AllowAnonymous, HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var account = new Account { Name = request.Name.Trim(), Email = NormalizeEmail(request.Email) };
        account.PasswordHash = hasher.HashPassword(account, request.Password);
        db.Accounts.Add(account);
        return await SaveAccount() ? NoContent() : Conflict(new { message = "Этот email уже зарегистрирован" });
    }

    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = NormalizeEmail(request.Email);
        var account = await db.Accounts.SingleOrDefaultAsync(user => user.Email == email);
        if (account is null)
            return Unauthorized(new { message = "Неверный email или пароль" });

        var check = hasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
        if (check == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "Неверный email или пароль" });

        if (check == PasswordVerificationResult.SuccessRehashNeeded)
        {
            account.PasswordHash = hasher.HashPassword(account, request.Password);
            await db.SaveChangesAsync();
        }

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, account.Id.ToString())],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
        return Ok(Profile(account));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync();
        return NoContent();
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var account = await CurrentAccount();
        return account is null ? Unauthorized() : Ok(Profile(account));
    }

    [HttpPut]
    public async Task<IActionResult> Update(ProfileRequest request)
    {
        var account = await CurrentAccount();
        if (account is null) return Unauthorized();

        var email = NormalizeEmail(request.Email);
        if (email != account.Email && (request.CurrentPassword is null ||
            hasher.VerifyHashedPassword(account, account.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed))
            return BadRequest(new { message = "Для изменения email введите текущий пароль" });

        account.Name = request.Name.Trim();
        account.Email = email;
        return await SaveAccount() ? Ok(Profile(account)) : Conflict(new { message = "Этот email уже зарегистрирован" });
    }

    [HttpPut("preferences")]
    public async Task<IActionResult> UpdatePreferences(PreferencesRequest request)
    {
        var account = await CurrentAccount();
        if (account is null) return Unauthorized();

        account.MealReminders = request.MealReminders;
        account.WeeklyReport = request.WeeklyReport;
        account.NutritionTips = request.NutritionTips;
        await db.SaveChangesAsync();
        return Ok(Profile(account));
    }

    private Task<Account?> CurrentAccount() => db.Accounts.FindAsync(int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!)).AsTask();
    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private async Task<bool> SaveAccount()
    {
        try
        {
            await db.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqliteException { SqliteExtendedErrorCode: 2067 })
        {
            return false;
        }
    }

    private static object Profile(Account account) => new
    {
        account.Name, account.Email, account.Goal,
        account.MealReminders, account.WeeklyReport, account.NutritionTips
    };
}

public sealed record RegisterRequest(
    [Required, StringLength(100)] string Name,
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(128, MinimumLength = 8)] string Password);

public sealed record LoginRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(128)] string Password);

public sealed record ProfileRequest(
    [Required, StringLength(100)] string Name,
    [Required, EmailAddress, StringLength(254)] string Email,
    [StringLength(128)] string? CurrentPassword);

public sealed record PreferencesRequest(bool MealReminders, bool WeeklyReport, bool NutritionTips);
