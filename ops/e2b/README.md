# E2B Code Interpreter Sandbox Template

This directory documents the recommended custom E2B sandbox template for Sutaeru data analysis, file generation, and code execution (P2-11).

## Recommended Libraries

The standard Python environment in the sandbox should include data science, database, file processing, and visualization libraries:

- **pandas**: Tabular data manipulation and analysis
- **numpy**: Numerical computing and array operations
- **matplotlib**: Static charts and plots (exported to PNG and rich results)
- **duckdb**: Fast embedded analytical SQL engine for querying local CSV, Parquet, and JSON files
- **openpyxl**: Excel spreadsheet read/write support (.xlsx)
- **python-docx**: Word document creation and editing (.docx)
- **scikit-learn**: Machine learning algorithms and statistical modeling

## Template Dockerfile Example

```dockerfile
# e2b.Dockerfile
FROM e2b/code-interpreter:latest

# Install recommended data science and document packages
RUN pip install --no-cache-dir \
    pandas \
    numpy \
    matplotlib \
    duckdb \
    openpyxl \
    python-docx \
    scikit-learn
```

## Building and Configuring the Template

1. Build the custom template using the E2B CLI:
   ```bash
   e2b template build -c "python3 -c 'import pandas, numpy, matplotlib, duckdb, openpyxl, docx, sklearn; print(\"OK\")'"
   ```

2. Once published, set the template ID in your production environment:
   ```bash
   E2B_SANDBOX_TEMPLATE=<your-template-id>
   ```

3. Configure idle timeout and cost tracking:
   ```bash
   SANDBOX_IDLE_MIN=15
   SANDBOX_COST_PER_MIN=0.03
   ```
