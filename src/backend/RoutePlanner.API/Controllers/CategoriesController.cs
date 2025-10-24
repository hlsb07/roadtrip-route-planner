using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RoutePlanner.API.Data;
using RoutePlanner.API.DTOs;
using RoutePlanner.API.Models;

namespace RoutePlanner.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoriesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public CategoriesController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/categories
        [HttpGet]
        public async Task<ActionResult<List<CategoryDto>>> GetCategories()
        {
            var categories = await _context.Categories
                .Select(c => new CategoryDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Icon = c.Icon,
                    Description = c.Description
                })
                .ToListAsync();

            return Ok(categories);
        }

        // GET: api/categories/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<CategoryDto>> GetCategory(int id)
        {
            var category = await _context.Categories.FindAsync(id);

            if (category == null)
                return NotFound();

            var categoryDto = new CategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Icon = category.Icon,
                Description = category.Description
            };

            return Ok(categoryDto);
        }

        // POST: api/categories
        [HttpPost]
        public async Task<ActionResult<CategoryDto>> CreateCategory(CreateCategoryDto createDto)
        {
            var category = new Category
            {
                Name = createDto.Name,
                Icon = createDto.Icon,
                Description = createDto.Description
            };

            _context.Categories.Add(category);
            await _context.SaveChangesAsync();

            var categoryDto = new CategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Icon = category.Icon,
                Description = category.Description
            };

            return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, categoryDto);
        }

        // PUT: api/categories/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCategory(int id, UpdateCategoryDto updateDto)
        {
            var category = await _context.Categories.FindAsync(id);

            if (category == null)
                return NotFound();

            category.Name = updateDto.Name;
            category.Icon = updateDto.Icon;
            category.Description = updateDto.Description;

            await _context.SaveChangesAsync();

            return NoContent();
        }

        // DELETE: api/categories/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var category = await _context.Categories
                .Include(c => c.PlaceCategories)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (category == null)
                return NotFound();

            // Check if category is being used by any places
            if (category.PlaceCategories.Count > 0)
            {
                return BadRequest(new
                {
                    message = "Cannot delete category because it is assigned to places",
                    placesCount = category.PlaceCategories.Count
                });
            }

            _context.Categories.Remove(category);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // GET: api/categories/{id}/places
        [HttpGet("{id}/places")]
        public async Task<ActionResult<List<PlaceDto>>> GetPlacesByCategory(int id)
        {
            var category = await _context.Categories.FindAsync(id);

            if (category == null)
                return NotFound();

            var places = await _context.PlaceCategories
                .Where(pc => pc.CategoryId == id)
                .Include(pc => pc.Place)
                .ThenInclude(p => p.PlaceCategories)
                .ThenInclude(pc => pc.Category)
                .Select(pc => new PlaceDto
                {
                    Id = pc.Place.Id,
                    Name = pc.Place.Name,
                    Latitude = pc.Place.Location.Y,
                    Longitude = pc.Place.Location.X,
                    Categories = pc.Place.PlaceCategories
                        .Select(pcat => new CategoryDto
                        {
                            Id = pcat.Category.Id,
                            Name = pcat.Category.Name,
                            Icon = pcat.Category.Icon,
                            Description = pcat.Category.Description
                        }).ToList()
                })
                .ToListAsync();

            return Ok(places);
        }
    }
}
