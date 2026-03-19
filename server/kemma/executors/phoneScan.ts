/**
 * Phone Scan Bridge Tool
 * 
 * Generates structured instructions for iOS Shortcuts or Android Termux
 * to execute file scanning operations on the device.
 * 
 * This is a BRIDGE tool - actual operations happen on the device.
 */

export interface PhoneInstructions {
  platform: 'ios' | 'android';
  method: 'shortcut' | 'termux';
  instructions: string;
  script?: string;
  expectedOutput: string;
}

export interface ScanOptions {
  path?: string;
  categories?: string[];
}

export type ScanAction = 'scan' | 'categorize' | 'duplicates' | 'suggest_cleanup';

/**
 * Generates phone-specific instructions for file scanning operations.
 * 
 * @param action - The scan action to perform
 * @param options - Optional parameters for the scan
 * @returns PhoneInstructions for the target platform
 */
export async function phoneScan(
  action: ScanAction,
  options?: ScanOptions
): Promise<PhoneInstructions> {
  // Detect platform from user agent or default to both options
  const platform = detectPlatform();

  switch (action) {
    case 'scan':
      return generateScanInstructions(platform, options);
    case 'categorize':
      return generateCategorizeInstructions(platform, options);
    case 'duplicates':
      return generateDuplicatesInstructions(platform, options);
    case 'suggest_cleanup':
      return generateCleanupInstructions(platform, options);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Detect the target platform based on context
 */
function detectPlatform(): 'ios' | 'android' {
  // In a real implementation, this would detect from request headers
  // or user agent. For now, we'll default to iOS but this could be
  // parameterized or detected from the client request.
  return 'ios';
}

/**
 * Generate instructions for scanning/listing files
 */
function generateScanInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  const targetPath = options?.path || (platform === 'ios' ? 'iCloud Drive' : '/sdcard');

  if (platform === 'ios') {
    return {
      platform: 'ios',
      method: 'shortcut',
      instructions: `Scan files in ${targetPath} using iOS Shortcuts`,
      script: generateIOSScanShortcut(targetPath),
      expectedOutput: 'JSON array of file objects with path, name, size, and modification date'
    };
  } else {
    return {
      platform: 'android',
      method: 'termux',
      instructions: `List all files in ${targetPath} recursively`,
      script: generateAndroidScanScript(targetPath),
      expectedOutput: 'JSON array of file objects with path, name, size (bytes), and modification timestamp'
    };
  }
}

/**
 * Generate instructions for categorizing files by type
 */
function generateCategorizeInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  const targetPath = options?.path || (platform === 'ios' ? 'iCloud Drive' : '/sdcard');
  const categories = options?.categories || ['images', 'videos', 'documents', 'audio', 'archives', 'other'];

  if (platform === 'ios') {
    return {
      platform: 'ios',
      method: 'shortcut',
      instructions: `Categorize files in ${targetPath} by type`,
      script: generateIOSCategorizeShortcut(targetPath, categories),
      expectedOutput: 'JSON object with category names as keys and arrays of file objects as values'
    };
  } else {
    return {
      platform: 'android',
      method: 'termux',
      instructions: `Categorize files by extension in ${targetPath}`,
      script: generateAndroidCategorizeScript(targetPath, categories),
      expectedOutput: 'JSON object with categories containing file paths, sizes, and counts per category'
    };
  }
}

/**
 * Generate instructions for finding duplicate files
 */
function generateDuplicatesInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  const targetPath = options?.path || (platform === 'ios' ? 'iCloud Drive' : '/sdcard');

  if (platform === 'ios') {
    return {
      platform: 'ios',
      method: 'shortcut',
      instructions: `Find duplicate files in ${targetPath} by comparing file hashes`,
      script: generateIOSDuplicatesShortcut(targetPath),
      expectedOutput: 'JSON array of duplicate groups, each containing matching file paths and hash'
    };
  } else {
    return {
      platform: 'android',
      method: 'termux',
      instructions: `Find duplicate files using MD5 hash comparison in ${targetPath}`,
      script: generateAndroidDuplicatesScript(targetPath),
      expectedOutput: 'JSON array of duplicate groups with file paths, sizes, and MD5 hashes'
    };
  }
}

/**
 * Generate instructions for suggesting cleanup candidates
 */
function generateCleanupInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  const targetPath = options?.path || (platform === 'ios' ? 'iCloud Drive' : '/sdcard');

  if (platform === 'ios') {
    return {
      platform: 'ios',
      method: 'shortcut',
      instructions: `Analyze ${targetPath} and suggest files for cleanup`,
      script: generateIOSCleanupShortcut(targetPath),
      expectedOutput: 'JSON object with cleanup categories: largeFiles, oldDownloads, tempFiles, unusedApps with potential space savings'
    };
  } else {
    return {
      platform: 'android',
      method: 'termux',
      instructions: `Analyze storage and suggest cleanup candidates in ${targetPath}`,
      script: generateAndroidCleanupScript(targetPath),
      expectedOutput: 'JSON object with cleanup suggestions, file counts, and estimated space savings in MB'
    };
  }
}

// ============================================================================
// iOS Shortcuts Script Generators
// ============================================================================

function generateIOSScanShortcut(path: string): string {
  return JSON.stringify({
    actions: [
      {
        action: 'Get File',
        parameters: {
          path: path,
          recursive: true,
          includeDetails: true
        }
      },
      {
        action: 'Repeat with Each',
        actions: [
          {
            action: 'Get Details of File',
            properties: ['name', 'path', 'size', 'creationDate', 'modificationDate']
          }
        ]
      },
      {
        action: 'Create Dictionary',
        output: 'fileList'
      },
      {
        action: 'Get Contents of URL',
        method: 'POST',
        url: '{{callbackUrl}}',
        body: '{{fileList}}'
      }
    ],
    outputFormat: 'json'
  }, null, 2);
}

function generateIOSCategorizeShortcut(path: string, categories: string[]): string {
  const categoryMap: Record<string, string[]> = {
    images: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'raw', 'tiff', 'bmp', 'webp'],
    videos: ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp'],
    documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'pages', 'numbers', 'keynote', 'xls', 'xlsx', 'ppt', 'pptx'],
    audio: ['mp3', 'aac', 'wav', 'flac', 'm4a', 'ogg', 'wma', 'aiff'],
    archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    other: []
  };

  return JSON.stringify({
    actions: [
      {
        action: 'Get File',
        parameters: {
          path: path,
          recursive: true
        }
      },
      {
        action: 'Filter Files',
        byExtension: categories.flatMap(c => categoryMap[c] || [])
      },
      {
        action: 'Group by Extension',
        outputVariable: 'groupedFiles'
      },
      {
        action: 'Create Dictionary',
        mapping: categories.reduce((acc, cat) => {
          acc[cat] = categoryMap[cat] || [];
          return acc;
        }, {} as Record<string, string[]>),
        output: 'categorizedFiles'
      },
      {
        action: 'Get Contents of URL',
        method: 'POST',
        url: '{{callbackUrl}}',
        body: '{{categorizedFiles}}'
      }
    ],
    outputFormat: 'json'
  }, null, 2);
}

function generateIOSDuplicatesShortcut(path: string): string {
  return JSON.stringify({
    actions: [
      {
        action: 'Get File',
        parameters: {
          path: path,
          recursive: true
        }
      },
      {
        action: 'Filter Files',
        excludeDirectories: true
      },
      {
        action: 'Calculate Hash',
        algorithm: 'MD5',
        outputVariable: 'fileHashes'
      },
      {
        action: 'Find Duplicates',
        compareBy: 'hash',
        groupOutput: 'duplicateGroups'
      },
      {
        action: 'Create Dictionary',
        include: ['hash', 'paths', 'count', 'totalSize'],
        output: 'duplicates'
      },
      {
        action: 'Get Contents of URL',
        method: 'POST',
        url: '{{callbackUrl}}',
        body: '{{duplicates}}'
      }
    ],
    outputFormat: 'json'
  }, null, 2);
}

function generateIOSCleanupShortcut(path: string): string {
  return JSON.stringify({
    actions: [
      {
        action: 'Get File',
        parameters: {
          path: path,
          recursive: true
        }
      },
      {
        action: 'Filter by Size',
        greaterThan: '100MB',
        outputVariable: 'largeFiles'
      },
      {
        action: 'Filter by Date',
        olderThan: '90 days',
        inPath: 'Downloads',
        outputVariable: 'oldDownloads'
      },
      {
        action: 'Find Temp Files',
        patterns: ['*.tmp', '*.temp', 'cache*', '.DS_Store'],
        outputVariable: 'tempFiles'
      },
      {
        action: 'Create Dictionary',
        structure: {
          largeFiles: { files: '{{largeFiles}}', count: '{{largeFiles.count}}', totalSize: '{{largeFiles.totalSize}}' },
          oldDownloads: { files: '{{oldDownloads}}', count: '{{oldDownloads.count}}', totalSize: '{{oldDownloads.totalSize}}' },
          tempFiles: { files: '{{tempFiles}}', count: '{{tempFiles.count}}', totalSize: '{{tempFiles.totalSize}}' },
          potentialSavings: '{{totalSavings}}'
        },
        output: 'cleanupSuggestions'
      },
      {
        action: 'Get Contents of URL',
        method: 'POST',
        url: '{{callbackUrl}}',
        body: '{{cleanupSuggestions}}'
      }
    ],
    outputFormat: 'json'
  }, null, 2);
}

// ============================================================================
// Android Termux Script Generators
// ============================================================================

function generateAndroidScanScript(path: string): string {
  return `#!/data/data/com.termux/files/usr/bin/bash
# Phone Scan Script for Android
# Target: ${path}

TARGET_PATH="${path}"
OUTPUT_FILE="/tmp/phone_scan_$(date +%s).json"

echo "[{"
echo '  "scanTime": "'$(date -Iseconds)'",'
echo '  "targetPath": "'${TARGET_PATH}'",'
echo '  "files": ['

first=true
find "$TARGET_PATH" -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  size=$(stat -c%s "$file" 2>/dev/null || echo "0")
  mtime=$(stat -c%Y "$file" 2>/dev/null || echo "0")
  echo '    {'
  echo '      "path": '$(echo "$file" | jq -R .)','
  echo '      "name": '$(basename "$file" | jq -R .)','
  echo '      "size": '$size','
  echo '      "modified": '$mtime
  echo -n '    }'
done

echo ""
echo "  ]"
echo "}]"

# Send result to callback
curl -X POST -H "Content-Type: application/json" -d @"$OUTPUT_FILE" "{{callbackUrl}}" 2>/dev/null
rm -f "$OUTPUT_FILE"`;
}

function generateAndroidCategorizeScript(path: string, categories: string[]): string {
  const categoryExtensions: Record<string, string> = {
    images: '-iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.webp" -o -iname "*.bmp" -o -iname "*.raw"',
    videos: '-iname "*.mp4" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.webm" -o -iname "*.flv" -o -iname "*.3gp"',
    documents: '-iname "*.pdf" -o -iname "*.doc" -o -iname "*.docx" -o -iname "*.txt" -o -iname "*.xls" -o -iname "*.xlsx" -o -iname "*.ppt" -o -iname "*.pptx"',
    audio: '-iname "*.mp3" -o -iname "*.aac" -o -iname "*.wav" -o -iname "*.flac" -o -iname "*.m4a" -o -iname "*.ogg"',
    archives: '-iname "*.zip" -o -iname "*.rar" -o -iname "*.7z" -o -iname "*.tar" -o -iname "*.gz" -o -iname "*.bz2"'
  };

  const categoryChecks = categories
    .filter(c => c !== 'other')
    .map(cat => `    ${cat})
      count=$(find "$TARGET_PATH" -type f \( ${categoryExtensions[cat] || ''} \) 2>/dev/null | wc -l)
      size=$(find "$TARGET_PATH" -type f \( ${categoryExtensions[cat] || ''} \) -exec stat -c%s {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
      echo '    "${cat}": { "count": '$((count)), "totalSize": '$((size))' }'`)  
    .join('\n    ;;\n');

  return `#!/data/data/com.termux/files/usr/bin/bash
# File Categorization Script for Android
# Target: ${path}
# Categories: ${categories.join(', ')}

TARGET_PATH="${path}"

echo "{"
echo '  "scanTime": "'$(date -Iseconds)'",'
echo '  "targetPath": "'${TARGET_PATH}'",'
echo '  "categories": {'

first_cat=true
for category in ${categories.join(' ')}; do
  if [ "$first_cat" = true ]; then
    first_cat=false
  else
    echo ","
  fi
  
  case $category in
${categoryChecks}
    ;;
    other)
      # Calculate "other" as files not matching known categories
      known_pattern='${categories.filter(c => c !== 'other').map(c => categoryExtensions[c]).filter(Boolean).join(' -o ')}'
      count=$(find "$TARGET_PATH" -type f ! \( $known_pattern \) 2>/dev/null | wc -l)
      size=$(find "$TARGET_PATH" -type f ! \( $known_pattern \) -exec stat -c%s {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
      echo '    "other": { "count": '$((count)), "totalSize": '$((size))' }'
    ;;
  esac
done

echo ""
echo "  }"
echo "}"

# Send result to callback
curl -X POST -H "Content-Type: application/json" -d @- "{{callbackUrl}}" 2>/dev/null`;
}

function generateAndroidDuplicatesScript(path: string): string {
  return `#!/data/data/com.termux/files/usr/bin/bash
# Duplicate File Finder for Android
# Target: ${path}

TARGET_PATH="${path}"
TEMP_DIR="/tmp/duplicates_$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "Scanning for duplicates..."

# Find all files and calculate MD5 hashes
find "$TARGET_PATH" -type f -exec md5sum {} + 2>/dev/null | sort > "$TEMP_DIR/hashes.txt"

# Find duplicate hashes
awk '{print $1}' "$TEMP_DIR/hashes.txt" | sort | uniq -d > "$TEMP_DIR/duplicate_hashes.txt"

echo "{"
echo '  "scanTime": "'$(date -Iseconds)'",'
echo '  "targetPath": "'${TARGET_PATH}'",'
echo '  "duplicateGroups": ['

first_group=true
while read -r hash; do
  if [ "$first_group" = true ]; then
    first_group=false
  else
    echo ","
  fi
  
  files=$(grep "^$hash" "$TEMP_DIR/hashes.txt" | awk '{print $2}')
  file_count=$(echo "$files" | wc -l)
  first_file=$(echo "$files" | head -1)
  file_size=$(stat -c%s "$first_file" 2>/dev/null || echo "0")
  
  echo '    {'
  echo '      "hash": "'$hash'",'
  echo '      "count": '$file_count','
  echo '      "sizePerFile": '$file_size','
  echo '      "totalSize": '$((file_count * file_size))','
  echo '      "files": ['
  
  first_file_entry=true
  echo "$files" | while read -r file; do
    if [ "$first_file_entry" = true ]; then
      first_file_entry=false
    else
      echo ","
    fi
    echo -n '        '$(echo "$file" | jq -R .)
  done
  
  echo ""
  echo '      ]'
  echo -n '    }'
done < "$TEMP_DIR/duplicate_hashes.txt"

echo ""
echo "  ]"
echo "}"

# Cleanup
rm -rf "$TEMP_DIR"

# Send result to callback
curl -X POST -H "Content-Type: application/json" -d @- "{{callbackUrl}}" 2>/dev/null`;
}

function generateAndroidCleanupScript(path: string): string {
  return `#!/data/data/com.termux/files/usr/bin/bash
# Cleanup Suggestion Script for Android
# Target: ${path}

TARGET_PATH="${path}"
DAYS_OLD=90
LARGE_FILE_THRESHOLD=$((100 * 1024 * 1024))  # 100MB

echo "Analyzing storage for cleanup suggestions..."

echo "{"
echo '  "scanTime": "'$(date -Iseconds)'",'
echo '  "targetPath": "'${TARGET_PATH}'",'
echo '  "suggestions": {'

# Large files (>100MB)
echo '    "largeFiles": {'
large_files=$(find "$TARGET_PATH" -type f -size +100M 2>/dev/null)
large_count=$(echo "$large_files" | grep -v "^$" | wc -l)
large_size=$(find "$TARGET_PATH" -type f -size +100M -exec stat -c%s {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
echo '      "count": '\$\{large_count:-0},'
echo '      "totalSizeBytes": '\$\{large_size:-0},'
echo '      "totalSizeMB": '$((large_size / 1024 / 1024))','
echo '      "threshold": "100MB",'
echo '      "files": ['
first=true
echo "$large_files" | while read -r file; do
  [ -z "$file" ] && continue
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  fsize=$(stat -c%s "$file" 2>/dev/null || echo "0")
  echo -n '        {"path": '$(echo "$file" | jq -R .)', "size": '$fsize'}'
done
echo ""
echo '      ]'
echo '    },'

# Old downloads (>90 days)
echo '    "oldDownloads": {'
download_path="${TARGET_PATH}/Download"
if [ -d "$download_path" ]; then
  old_files=$(find "$download_path" -type f -mtime +${DAYS_OLD} 2>/dev/null)
  old_count=$(echo "$old_files" | grep -v "^$" | wc -l)
  old_size=$(find "$download_path" -type f -mtime +${DAYS_OLD} -exec stat -c%s {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
else
  old_count=0
  old_size=0
fi
echo '      "count": '\${old_count:-0}\,'
echo '      "totalSizeBytes": '"'\${old_size:-0}'",'
echo '      "totalSizeMB": '$((old_size / 1024 / 1024))','
echo '      "olderThanDays": '${DAYS_OLD}','
echo '      "files": ['
first=true
echo "$old_files" | while read -r file; do
  [ -z "$file" ] && continue
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  fsize=$(stat -c%s "$file" 2>/dev/null || echo "0")
  fmtime=$(stat -c%Y "$file" 2>/dev/null || echo "0")
  echo -n '        {"path": '$(echo "$file" | jq -R .)', "size": '$fsize', "modified": '$fmtime'}'
done
echo ""
echo '      ]'
echo '    },'

# Temp files
echo '    "tempFiles": {'
temp_patterns='-iname "*.tmp" -o -iname "*.temp" -o -iname "*cache*" -o -iname "*.log" -o -iname "*.bak"'
temp_files=$(find "$TARGET_PATH" -type f \( $temp_patterns \) 2>/dev/null)
temp_count=$(echo "$temp_files" | grep -v "^$" | wc -l)
temp_size=$(find "$TARGET_PATH" -type f \( $temp_patterns \) -exec stat -c%s {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
echo '      "count": '"'\${temp_count:-0}'",'
echo '      "totalSizeBytes": '"'\${temp_size:-0}'",'
echo '      "totalSizeMB": '$((temp_size / 1024 / 1024))','
echo '      "patterns": ["*.tmp", "*.temp", "*cache*", "*.log", "*.bak"],'
echo '      "files": ['
first=true
echo "$temp_files" | while read -r file; do
  [ -z "$file" ] && continue
  if [ "$first" = true ]; then
    first=false
  else
    echo ","
  fi
  fsize=$(stat -c%s "$file" 2>/dev/null || echo "0")
  echo -n '        {"path": '$(echo "$file" | jq -R .)', "size": '$fsize'}'
done
echo ""
echo '      ]'
echo '    }'

# Summary
total_savings=$((large_size + old_size + temp_size))
echo '  },'
echo '  "summary": {'
echo '    "totalFilesScanned": '$(find "$TARGET_PATH" -type f 2>/dev/null | wc -l)','
echo '    "potentialSavingsBytes": '${total_savings}','
echo '    "potentialSavingsMB": '$((total_savings / 1024 / 1024))','
echo '    "potentialSavingsGB": '$(awk "BEGIN {printf \"%.2f\", ${total_savings} / 1024 / 1024 / 1024}")
echo '  }'
echo "}"

# Send result to callback
curl -X POST -H "Content-Type: application/json" -d @- "{{callbackUrl}}" 2>/dev/null`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate instructions for a specific platform
 * Useful when platform is known in advance
 */
export async function phoneScanForPlatform(
  platform: 'ios' | 'android',
  action: ScanAction,
  options?: ScanOptions
): Promise<PhoneInstructions> {
  const instructions = await phoneScan(action, options);
  
  // Override platform if specified
  if (platform !== detectPlatform()) {
    // Regenerate for the requested platform
    switch (action) {
      case 'scan':
        return generateScanInstructions(platform, options);
      case 'categorize':
        return generateCategorizeInstructions(platform, options);
      case 'duplicates':
        return generateDuplicatesInstructions(platform, options);
      case 'suggest_cleanup':
        return generateCleanupInstructions(platform, options);
    }
  }
  
  return instructions;
}

/**
 * Validate scan options
 */
export function validateScanOptions(options?: ScanOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options?.path) {
    // Basic path validation
    if (options.path.includes('..') || options.path.includes('~')) {
      errors.push('Path contains invalid characters');
    }
  }

  if (options?.categories) {
    const validCategories = ['images', 'videos', 'documents', 'audio', 'archives', 'other'];
    const invalid = options.categories.filter(c => !validCategories.includes(c));
    if (invalid.length > 0) {
      errors.push(`Invalid categories: ${invalid.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export default phoneScan;
