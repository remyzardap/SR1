---
name: Project Cost Breakdown
description: Build an itemized cost estimate for a project with quantities, unit costs, contingency, and total.
---

# Project Cost Breakdown

Use this skill when the user asks for a budget, estimate, or cost breakdown for a project.

## Steps

1. Ask the user for scope, timeline, team size, and location if not provided. If the message already includes them, proceed.
2. Break the project into cost categories: labor, materials, software/tools, services, overhead, contingency.
3. Estimate unit costs and quantities for each line item.
4. Sum subtotals and add a 10-20% contingency.
5. Present the result as a structured table and a short explanation.

## Output format

- **Assumptions**: bullets listing scope, timeline, team, location, and rate assumptions.
- **Cost table**: columns for Category, Item, Quantity, Unit Cost, Subtotal.
- **Total**: subtotal + contingency = total.
- **Notes**: caveats and what could change the estimate.

## Rules

- State assumptions clearly.
- Use market-rate ranges when exact costs are unknown.
- Do not present the estimate as a binding quote.
