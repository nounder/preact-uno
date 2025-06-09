#!/usr/bin/env bun

import * as NFS from "node:fs"
import * as NPath from "node:path"

const Packages = [
  "./upstream/preact",
  "./upstream/preact-iso",
  "./upstream/preact-render-to-string",
  "./upstream/signals/packages/core",
  "./upstream/signals/packages/preact",
]

const PackagesDir = "./packages"

const PackageJsonAllowedFiels = new Set<keyof PackageJson>([
  "version",
  "description",
  "license",
  "authors",
  "homepage",
  "dependencies",
  "sideEffects",
  "exports",
  "imports",
])

interface PackageJson {
  name: string
  version?: string
  description?: string
  license?: string
  authors?: string[]
  homepage?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  files?: string[]
  sideEffects?: boolean
  exports?: string | Record<string, any>
  [key: string]: any
}

interface PackageInfo {
  path: string
  directoryName: string
  packageJsonName: string
}

interface TypeScriptConfig {
  extends?: string
  references?: Array<{
    path: string
    [key: string]: any
  }>
  compilerOptions?: {
    typeRoots?: string[]
    [key: string]: any
  }
  [key: string]: any
}

function extractFilePaths(files: string[]): string[] {
  const paths: Set<string> = new Set()

  for (const file of files) {
    if (file && typeof file === "string") {
      paths.add(file.replace(/^\.\//, ""))
    }
  }

  return Array.from(paths)
}

function replaceWorkspaceDependencies(
  dependencies: Record<string, string> | undefined,
  packageNameToDir: Map<string, string>,
  currentPackageDir: string,
  dependencyType: string,
): Record<string, string> | undefined {
  if (!dependencies) return dependencies

  const result: Record<string, string> = {}

  for (const [depName, depVersion] of Object.entries(dependencies)) {
    if (depVersion.startsWith("workspace:")) {
      console.log(
        `  🔄 Processing workspace dependency: ${depName} = ${depVersion}`,
      )

      const targetDirName = packageNameToDir.get(depName)
      if (!targetDirName) {
        throw new Error(
          `❌ Workspace dependency "${depName}" not found in processed packages. Available packages: ${
            Array.from(packageNameToDir.keys()).join(", ")
          }`,
        )
      }

      // Calculate relative path from current package to target package
      const relativePath = NPath.relative(
        currentPackageDir,
        NPath.join(PackagesDir, targetDirName),
      )
      const fileReference = `file:${relativePath}`

      console.log(
        `  ✅ Replaced ${dependencyType} "${depName}": "${depVersion}" → "${fileReference}"`,
      )
      result[depName] = fileReference
    } else {
      result[depName] = depVersion
    }
  }

  return result
}

function transformExportsField(
  exports: string | Record<string, any>,
  packageDir: string,
): string | Record<string, any> {
  const supportedConditions = new Set(["types", "browser", "import"])

  function findSourceFile(
    exportKey: string,
    exportValues?: string | string[],
  ): string | null {
    // First, check if the export key refers to a literal file that exists
    if (exportKey !== "." && exportKey.startsWith("./")) {
      const literalPath = exportKey
      const fullLiteralPath = NPath.resolve(packageDir, literalPath)
      const stat = NFS.existsSync(fullLiteralPath)
        && NFS.statSync(fullLiteralPath)
      if (stat && stat.isFile()) {
        console.log(
          `  📄 Found literal file: "${literalPath}" for export "${exportKey}"`,
        )
        return literalPath
      }
    }

    // Collect all export value paths
    const valuePaths: string[] = []
    if (exportValues) {
      if (typeof exportValues === "string") {
        valuePaths.push(exportValues)
      } else if (Array.isArray(exportValues)) {
        valuePaths.push(...exportValues.filter((v) => typeof v === "string"))
      }
    }

    const directories = [
      ...valuePaths.map(v => NPath.parse(v).dir.substring(2)),
    ]

    // Common source file patterns to check
    const sourceExtensions = [".js", ".ts", ".tsx", ".mjs"]
    const indexFiles = sourceExtensions.map(ext => `index${ext}`)

    // First, check directories extracted from export values
    for (const dir of directories) {
      // Check for source files in common patterns
      const patterns = [
        ...indexFiles.map(f => `./${dir}/src/${f}`),
        ...indexFiles.map(f => `./${dir}/${f}`),
      ]

      // Also check for specific filenames if we can extract them
      for (const valuePath of valuePaths) {
        if (!valuePath || !valuePath.includes(dir)) continue

        const ext = NPath.extname(valuePath)
        const filename = NPath.basename(valuePath, ext)
        if (filename && filename !== "index") {
          for (const ext of sourceExtensions) {
            patterns.push(`./${dir}/src/${filename}${ext}`)
            patterns.push(`./${dir}/${filename}${ext}`)
          }
        }
      }

      for (const pattern of patterns) {
        if (NFS.existsSync(NPath.resolve(packageDir, pattern))) {
          console.log(
            `  🔍 Found source file: "${pattern}" for export "${exportKey}"`,
          )
          return pattern
        }
      }
    }

    // Fallback: check based on export key if it's a subpath
    if (exportKey !== "." && exportKey.startsWith("./")) {
      const subPath = exportKey.substring(2) // Remove './'

      const keyPatterns = [
        ...indexFiles.map(f => `./${subPath}/src/${f}`),
        ...indexFiles.map(f => `./${subPath}/${f}`),
        ...sourceExtensions.map(ext => `./${subPath}${ext}`),
        // Check for source files in src directory named after the export key
        ...sourceExtensions.map(ext => `./src/${subPath}${ext}`),
      ]

      for (const pattern of keyPatterns) {
        if (NFS.existsSync(NPath.resolve(packageDir, pattern))) {
          console.log(
            `  🔍 Found source from export key: "${pattern}" for export "${exportKey}"`,
          )
          return pattern
        }
      }
    }

    if (exportKey === ".") {
      for (const indexFile of indexFiles) {
        const patterns = [`./src/${indexFile}`, `./${indexFile}`]
        for (const pattern of patterns) {
          if (NFS.existsSync(NPath.resolve(packageDir, pattern))) {
            console.log(`  🔍 Found root source file: "${pattern}"`)
            return pattern
          }
        }
      }
    }

    // Log warning when no source file could be found
    console.warn(
      `  ⚠️  No source file found for export "${exportKey}" with export values: ${
        JSON.stringify(exportValues)
      }`,
    )

    return null
  }

  if (typeof exports === "string") {
    // Simple string export
    const sourceFile = findSourceFile(".", exports)
    if (sourceFile) {
      console.log(
        `  ✅ Transformed simple export: "${exports}" → "${sourceFile}"`,
      )
      return sourceFile
    }
    console.warn(
      `⚠️  Could not find source file for simple export "${exports}"`,
    )
    return exports
  }

  if (typeof exports === "object" && exports !== null) {
    const transformed: Record<string, any> = {}

    for (const [key, value] of Object.entries(exports)) {
      if (typeof value === "string") {
        // Direct string value
        const sourceFile = findSourceFile(key, value)
        if (sourceFile) {
          transformed[key] = sourceFile
          console.log(
            `  ✅ Transformed direct export "${key}": "${value}" → "${sourceFile}"`,
          )
        } else {
          console.warn(
            `⚠️  Could not find source file for export "${key}", keeping original: "${value}"`,
          )
          transformed[key] = value
        }
      } else if (typeof value === "object" && value !== null) {
        // Condition map - collect all condition values for better analysis
        const conditionValues: string[] = []
        for (const [condition, conditionValue] of Object.entries(value)) {
          if (
            typeof conditionValue === "string"
            && supportedConditions.has(condition)
          ) {
            conditionValues.push(conditionValue)
          }
        }

        // Find source file using all available condition values
        const sourceFile = findSourceFile(key, conditionValues)

        const transformedConditions: Record<string, any> = {}

        for (const [condition, conditionValue] of Object.entries(value)) {
          // Only process supported conditions
          if (!supportedConditions.has(condition)) {
            console.log(
              `  ⏭️  Skipping unsupported export condition: "${condition}"`,
            )
            continue
          }

          if (typeof conditionValue === "string") {
            if (condition === "types") {
              // For types, first check if the original types file exists
              const originalTypesPath = NPath.resolve(
                packageDir,
                conditionValue,
              )
              if (NFS.existsSync(originalTypesPath)) {
                transformedConditions[condition] = conditionValue
                console.log(
                  `  ✅ Keeping existing types file: "${conditionValue}"`,
                )
              } else if (sourceFile) {
                // Try to find a types file next to the source
                const typesExtensions = [".d.ts", ".ts"]
                let foundTypesFile = false

                for (const ext of typesExtensions) {
                  const typesPath = sourceFile.replace(/\.[^/.]+$/, ext)
                  const fullTypesPath = NPath.resolve(packageDir, typesPath)
                  if (NFS.existsSync(fullTypesPath)) {
                    transformedConditions[condition] = typesPath
                    console.log(`  ✅ Found types file: "${typesPath}"`)
                    foundTypesFile = true
                    break
                  }
                }

                if (!foundTypesFile) {
                  console.log(
                    `  ⚠️  No types file found for "${key}", skipping types condition`,
                  )
                }
              } else {
                console.log(
                  `  ⚠️  Cannot resolve source for types, skipping types condition`,
                )
              }
            } else {
              // For browser and import, use the resolved source file
              if (sourceFile) {
                transformedConditions[condition] = sourceFile
                console.log(
                  `  ✅ Transformed ${condition}: "${conditionValue}" → "${sourceFile}"`,
                )
              } else {
                console.warn(
                  `⚠️  Could not find source file for ${condition} condition, skipping`,
                )
              }
            }
          }
        }

        // Remove browser condition if it's the same as import condition
        if (
          transformedConditions.browser
          && transformedConditions.import
          && transformedConditions.browser === transformedConditions.import
        ) {
          console.log(
            `  🧹 Removing duplicate browser condition for "${key}" (same as import: "${transformedConditions.import}")`,
          )
          delete transformedConditions.browser
        }

        // Only include the key if it has supported conditions
        if (Object.keys(transformedConditions).length > 0) {
          transformed[key] = transformedConditions
        } else {
          console.log(
            `  ⏭️  Skipping export key "${key}" - no supported conditions found`,
          )
        }
      } else {
        transformed[key] = value
      }
    }

    return transformed
  }

  return exports
}

/**
 * Validates path references in TypeScript/JavaScript configuration files.
 *
 * Ensures that all external path references in tsconfig.json or jsconfig.json
 * files point to existing files or directories. This prevents broken configurations when
 * packages are copied to standalone directories.
 *
 * @param config - Parsed TypeScript/JavaScript configuration object
 * @param packageDir - Base directory to resolve relative paths from
 * @param configFileName - Name of the config file being validated (for logging)
 *
 * Validates the following fields:
 * - `extends`: Must point to an existing configuration file
 * - `references`: Each reference must point to a directory with a tsconfig.json file
 * - `compilerOptions.typeRoots`: Each path must point to an existing directory
 *   (supports wildcard patterns by checking the base directory)
 *
 * @throws {Error} If any referenced path does not exist or is invalid
 */
async function validateConfigPaths(
  config: TypeScriptConfig,
  packageDir: string,
  configFileName: string,
): Promise<void> {
  console.log(`🔍 Validating paths in ${configFileName}...`)

  // Validate 'extends' field - should point to an existing config file
  if (config.extends) {
    const extendsPath = config.extends as string
    console.log(`  📋 Checking extends: "${extendsPath}"`)
    const resolvedPath = NPath.resolve(packageDir, extendsPath)
    const extendsStat = await NFS.promises.stat(resolvedPath).catch(() => null)
    if (!extendsStat) {
      throw new Error(
        `❌ Config file extends path does not exist: "${extendsPath}" (resolved to: ${resolvedPath})`,
      )
    }
    console.log(`  ✅ Extends path exists: "${extendsPath}"`)
  }

  // Validate 'references' field - should point to existing directories with tsconfig.json
  if (config.references && Array.isArray(config.references)) {
    console.log(
      `  📋 Checking ${config.references.length} project references...`,
    )
    for (const ref of config.references) {
      if (ref.path) {
        const refPath = NPath.resolve(packageDir, ref.path)
        const refConfigPath = NPath.join(refPath, "tsconfig.json")

        const refStat = await NFS.promises.stat(refPath).catch(() => null)
        if (!refStat) {
          throw new Error(
            `❌ Project reference directory does not exist: "${ref.path}" (resolved to: ${refPath})`,
          )
        }

        const refConfigStat = await NFS.promises.stat(refConfigPath).catch(() =>
          null
        )
        if (!refConfigStat) {
          throw new Error(
            `❌ Project reference tsconfig.json does not exist: "${ref.path}/tsconfig.json" (resolved to: ${refConfigPath})`,
          )
        }

        console.log(`  ✅ Reference path exists: "${ref.path}"`)
      }
    }
  }

  // Validate 'compilerOptions.typeRoots' field - should point to existing directories
  if (
    config.compilerOptions?.typeRoots
    && Array.isArray(config.compilerOptions.typeRoots)
  ) {
    console.log(
      `  📋 Checking ${config.compilerOptions.typeRoots.length} typeRoots...`,
    )
    for (const typeRoot of config.compilerOptions.typeRoots) {
      // Handle wildcard patterns by checking the base directory
      let pathToCheck = typeRoot
      if (pathToCheck.includes("*")) {
        // For patterns like "./types/*" or "./node_modules/@types", check the base directory
        const basePath = pathToCheck.split("*")[0]
        if (basePath) {
          pathToCheck = basePath.replace(/\/$/, "")
        }
        console.log(
          `  📋 Checking wildcard typeRoot base directory: "${pathToCheck}"`,
        )
      } else {
        console.log(`  📋 Checking typeRoot directory: "${pathToCheck}"`)
      }

      const typeRootPath = NPath.resolve(packageDir, pathToCheck)
      const typeRootStat = await NFS.promises.stat(typeRootPath).catch(() =>
        null
      )
      if (!typeRootStat) {
        throw new Error(
          `❌ TypeRoot path does not exist: "${typeRoot}" (checking base path: ${typeRootPath})`,
        )
      }

      if (!typeRootStat.isDirectory()) {
        throw new Error(
          `❌ TypeRoot path is not a directory: "${typeRoot}" (resolved to: ${typeRootPath})`,
        )
      }

      console.log(`  ✅ TypeRoot path exists: "${typeRoot}"`)
    }
  }

  console.log(`  ✅ All paths in ${configFileName} are valid`)
}

function filterPackageJson(
  packageJson: PackageJson,
  packageDir: string,
  packageNameToDir: Map<string, string>,
  targetPackageDir: string,
): PackageJson {
  const filtered: PackageJson = {
    name: packageJson.name,
  }

  // Only add the specified fields if they exist
  for (const field in packageJson) {
    if (
      PackageJsonAllowedFiels.has(field as keyof PackageJson)
      && packageJson[field] !== undefined
    ) {
      if (field === "exports") {
        // Transform exports field to resolve to source files
        console.log(`🔄 Transforming exports field...`)
        const originalExports = packageJson[field]
        console.log(
          `📤 Original exports:`,
          JSON.stringify(originalExports, null, 2),
        )

        const transformedExports = transformExportsField(
          originalExports,
          packageDir,
        )
        console.log(
          `📥 Transformed exports:`,
          JSON.stringify(transformedExports, null, 2),
        )

        filtered[field] = transformedExports
      } else if (field === "dependencies") {
        // Transform workspace dependencies to file references
        console.log(`🔗 Processing dependencies...`)
        const transformedDeps = replaceWorkspaceDependencies(
          packageJson.dependencies,
          packageNameToDir,
          targetPackageDir,
          "dependency",
        )
        if (transformedDeps && Object.keys(transformedDeps).length > 0) {
          filtered[field] = transformedDeps
        }
      } else if (field === "devDependencies") {
        // Transform workspace devDependencies to file references
        console.log(`🔗 Processing devDependencies...`)
        const transformedDevDeps = replaceWorkspaceDependencies(
          packageJson.devDependencies,
          packageNameToDir,
          targetPackageDir,
          "devDependency",
        )
        if (transformedDevDeps && Object.keys(transformedDevDeps).length > 0) {
          filtered[field] = transformedDevDeps
        }
      } else {
        filtered[field] = packageJson[field]
      }
    }
  }

  return filtered
}

async function getPackageInfo(): Promise<Array<PackageInfo>> {
  const packageInfo: Array<PackageInfo> = []

  for (const packagePath of Packages) {
    const resolvedPath = NPath.resolve(packagePath)

    if (!NFS.existsSync(resolvedPath)) {
      console.error(`❌ Package directory not found: ${packagePath}`)
      continue
    }

    if (!NFS.statSync(resolvedPath).isDirectory()) {
      console.error(`❌ Path is not a directory: ${packagePath}`)
      continue
    }

    // Read package.json to get the actual package name
    const packageJsonPath = NPath.join(resolvedPath, "package.json")
    if (!NFS.existsSync(packageJsonPath)) {
      console.error(`❌ package.json not found in ${packagePath}`)
      continue
    }

    let packageJsonName: string
    try {
      const packageJsonContent = await Bun.file(packageJsonPath).text()
      const packageJson = JSON.parse(packageJsonContent)
      packageJsonName = packageJson.name
    } catch (error) {
      console.error(
        `❌ Failed to read package.json in ${packagePath}: ${error}`,
      )
      continue
    }

    // Use basename for simple packages, or construct name for nested packages
    let directoryName: string
    if (packagePath.includes("/packages/")) {
      // For signals packages, use signals-core, signals-preact format
      const parts = packagePath.split("/")
      const parentDir = parts[parts.indexOf("packages") - 1]
      const subPackage = NPath.basename(packagePath)
      directoryName = `${parentDir}-${subPackage}`
    } else {
      directoryName = NPath.basename(packagePath)
    }

    packageInfo.push({
      path: resolvedPath,
      directoryName: directoryName,
      packageJsonName: packageJsonName,
    })
  }

  if (packageInfo.length === 0) {
    console.error("❌ No valid packages found")
    process.exit(1)
  }

  return packageInfo
}

async function cleanupExistingArtifacts() {
  const packagesDirPath = NPath.resolve(PackagesDir)

  if (NFS.existsSync(packagesDirPath)) {
    console.log(`🧹 Cleaning up existing ${PackagesDir}...`)
    try {
      await Bun.$`rm -rf ${packagesDirPath}`
    } catch (error) {
      console.error(`❌ Failed to remove ${PackagesDir}: ${error}`)
    }
  }

  console.log(`✅ Cleanup completed`)
}

async function copyPackageToPackagesDir(
  packagePath: string,
  packageName: string,
  packageNameToDir: Map<string, string>,
) {
  const packageDir = packagePath
  const packagesDirPath = NPath.resolve(PackagesDir)
  const targetDir = NPath.join(packagesDirPath, packageName)

  // Check if package directory exists
  if (!NFS.existsSync(packageDir)) {
    console.error(`❌ Package directory "${packageDir}" not found`)
    return false
  }

  // Read package.json from upstream package
  const packageJsonPath = NPath.join(packageDir, "package.json")
  if (!NFS.existsSync(packageJsonPath)) {
    console.error(`❌ package.json not found in ${packageDir}`)
    return false
  }

  let packageJson: PackageJson
  try {
    const packageJsonContent = await Bun.file(packageJsonPath).text()
    packageJson = JSON.parse(packageJsonContent)
    console.log(
      `📦 Found package: ${packageJson.name} (${
        packageJson.version || "no version"
      })`,
    )
    if (packageJson.description) {
      console.log(`📝 Description: ${packageJson.description}`)
    }
  } catch (error) {
    console.error(`❌ Failed to read or parse package.json: ${error}`)
    return false
  }

  // Extract file paths from package.json
  if (!packageJson.files || !Array.isArray(packageJson.files)) {
    console.error(
      `❌ No "files" field found in package.json for ${packageName}`,
    )
    console.log(`💡 Available fields: ${Object.keys(packageJson).join(", ")}`)
    return false
  }

  const filePaths = extractFilePaths(packageJson.files)

  if (filePaths.length === 0) {
    console.error(
      `❌ No valid file paths found in "files" field for ${packageName}`,
    )
    console.log(
      `📄 Files field content:`,
      JSON.stringify(packageJson.files, null, 2),
    )
    return false
  }

  console.log(`📋 Found ${filePaths.length} file paths:`)
  filePaths.forEach(filePath => console.log(`  - ${filePath}`))

  // Create target directory
  try {
    await Bun.$`mkdir -p ${targetDir}`
  } catch (error) {
    console.error(`❌ Failed to create target directory: ${error}`)
    return false
  }

  // Create filtered package.json
  console.log(`📄 Creating filtered package.json...`)
  const filteredPackageJson = filterPackageJson(
    packageJson,
    packageDir,
    packageNameToDir,
    targetDir,
  )

  try {
    const filteredContent = JSON.stringify(filteredPackageJson, null, 2)
    await Bun.write(NPath.join(targetDir, "package.json"), filteredContent)
    console.log(
      `  ✅ Created filtered package.json with fields: ${
        Object
          .keys(filteredPackageJson)
          .join(", ")
      }`,
    )
  } catch (error) {
    console.error(`❌ Failed to write filtered package.json: ${error}`)
    return false
  }

  // Copy each file/directory specified in files field
  let copiedFiles = 0
  console.log(`📂 Copying files...`)

  for (const filePath of filePaths) {
    const sourcePath = NPath.join(packageDir, filePath)
    const targetPath = NPath.join(targetDir, filePath)

    // Special handling for the main package.json - skip it since we create a filtered version
    if (filePath === "package.json") {
      console.log(
        `  ⏭️  Skipping main package.json (filtered version created separately)`,
      )
      continue
    }

    if (!NFS.existsSync(sourcePath)) {
      console.warn(
        `⚠️  File path "${filePath}" does not exist in source package`,
      )
      continue
    }

    try {
      // Create parent directory if it doesn't exist
      const parentDir = NPath.join(
        targetDir,
        filePath.split("/").slice(0, -1).join("/"),
      )
      if (parentDir !== targetDir && !NFS.existsSync(parentDir)) {
        await Bun.$`mkdir -p ${parentDir}`
      }

      // Check if it's a file or directory and copy appropriately
      const stats = NFS.statSync(sourcePath)
      if (stats.isDirectory()) {
        await Bun.$`cp -r ${sourcePath} ${targetPath}`
        console.log(`  📁 Copied directory ${filePath}`)
      } else {
        await Bun.$`cp ${sourcePath} ${targetPath}`
        console.log(`  📄 Copied file ${filePath}`)
      }
      copiedFiles++
    } catch (error) {
      console.error(`❌ Failed to copy "${filePath}": ${error}`)
    }
  }

  // Copy tsconfig.json and jsconfig.json if they exist
  const configFiles = ["tsconfig.json", "jsconfig.json"]
  let copiedConfigFiles = 0
  console.log(`🔧 Checking for config files...`)

  for (const configFile of configFiles) {
    const configSourcePath = NPath.join(packageDir, configFile)
    const configTargetPath = NPath.join(targetDir, configFile)

    if (NFS.existsSync(configSourcePath)) {
      try {
        await Bun.$`cp ${configSourcePath} ${configTargetPath}`
        console.log(`  📄 Copied config file ${configFile}`)
        copiedConfigFiles++

        // Validate that all referenced paths in the config file exist
        // This ensures config files don't reference non-existent external dependencies
        try {
          const configContent = NFS.readFileSync(configTargetPath, "utf-8")
          const parsedConfig = JSON.parse(configContent)
          await validateConfigPaths(parsedConfig, targetDir, configFile)
        } catch (parseError) {
          console.warn(
            `⚠️  Could not parse or validate ${configFile}: ${parseError}`,
          )
          // Continue processing - config file was copied but validation skipped
        }
      } catch (error) {
        console.error(`❌ Failed to copy or validate "${configFile}": ${error}`)
      }
    }
  }

  // Always consider successful if we created the filtered package.json
  console.log(
    `✅ Successfully copied package "${packageName}" to ${PackagesDir}`,
  )
  console.log(
    `📊 Copied ${copiedFiles} files/directories from "files" field + ${copiedConfigFiles} config files + filtered package.json`,
  )

  return true
}

/**
 * Process all JavaScript/TypeScript files in the packages directory and resolve relative imports
 * using Bun.Transpiler to scan imports and Bun.resolveSync to resolve paths
 */
async function resolveRelativeImports(packagesDir: string): Promise<void> {
  console.log("\n🔄 Resolving relative imports in all exported files...")
  console.log("━".repeat(50))

  const transpiler = new Bun.Transpiler({
    loader: "tsx",
  })

  // Find all JavaScript/TypeScript files
  const jstsFiles: string[] = []

  async function findFiles(dir: string) {
    const entries = await NFS.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = NPath.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules directories
        if (entry.name === "node_modules") continue
        await findFiles(fullPath)
      } else if (entry.isFile()) {
        // Check for JS/TS files
        const ext = NPath.extname(entry.name).toLowerCase()
        if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
          jstsFiles.push(fullPath)
        }
      }
    }
  }

  await findFiles(packagesDir)
  console.log(
    `📋 Found ${jstsFiles.length} JavaScript/TypeScript files to process`,
  )

  let processedCount = 0
  let modifiedCount = 0

  for (const filePath of jstsFiles) {
    try {
      const content = await Bun.file(filePath).text()
      const fileDir = NPath.dirname(filePath)

      // Use Bun.Transpiler to scan for imports
      const imports = transpiler.scanImports(content)

      let modified = false
      let newContent = content

      // Process each import found
      for (const imp of imports) {
        // Only process relative imports
        if (!imp.path.startsWith(".")) continue

        try {
          // Try to resolve the import path relative to the file's directory
          let resolvedPath: string | null = null

          // First try to resolve as-is
          try {
            resolvedPath = Bun.resolveSync(imp.path, fileDir)
          } catch (e) {
            // If that fails, try common extensions
            const extensions = [
              ".ts",
              ".tsx",
              ".js",
              ".jsx",
              ".mjs",
              ".cjs",
              ".d.ts",
            ]
            for (const ext of extensions) {
              try {
                resolvedPath = Bun.resolveSync(imp.path + ext, fileDir)
                break
              } catch (e2) {
                // Continue trying other extensions
              }
            }

            // If still not found, try index files
            if (!resolvedPath) {
              const indexExtensions = [
                "/index.ts",
                "/index.tsx",
                "/index.js",
                "/index.jsx",
                "/index.mjs",
                "/index.cjs",
              ]
              for (const indexExt of indexExtensions) {
                try {
                  resolvedPath = Bun.resolveSync(imp.path + indexExt, fileDir)
                  break
                } catch (e3) {
                  // Continue trying other index extensions
                }
              }
            }
          }

          if (!resolvedPath) {
            throw new Error(`Could not resolve import "${imp.path}"`)
          }

          // Convert back to relative path from the file's location
          let relativePath = NPath.relative(fileDir, resolvedPath)

          // Ensure the path starts with ./ or ../
          if (!relativePath.startsWith(".")) {
            relativePath = "./" + relativePath
          }

          // Keep file extensions - don't remove them
          // const ext = NPath.extname(relativePath).toLowerCase()
          // if (
          //   [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)
          //   && !relativePath.endsWith(".d.ts")
          // ) {
          //   relativePath = relativePath.slice(0, -ext.length)
          // }

          // Only replace if the resolved path is different
          if (relativePath !== imp.path) {
            // Create a regex to match the exact import statement
            const importRegex = new RegExp(
              `(from\\s+['"\`])(${
                imp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              })(['"\`])`,
              "g",
            )

            const dynamicImportRegex = new RegExp(
              `(import\\s*\\(\\s*['"\`])(${
                imp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              })(['"\`]\\s*\\))`,
              "g",
            )

            const beforeReplace = newContent
            newContent = newContent.replace(importRegex, `$1${relativePath}$3`)
            newContent = newContent.replace(
              dynamicImportRegex,
              `$1${relativePath}$3`,
            )

            if (newContent !== beforeReplace) {
              console.log(
                `  📝 ${
                  NPath.relative(packagesDir, filePath)
                }: "${imp.path}" → "${relativePath}"`,
              )
              modified = true
            }
          }
        } catch (resolveError) {
          // If we can't resolve the import, log a warning but continue
          console.warn(
            `  ⚠️  Could not resolve import "${imp.path}" in ${
              NPath.relative(packagesDir, filePath)
            }: ${resolveError}`,
          )
        }
      }

      // Write the file back if it was modified
      if (modified) {
        await Bun.write(filePath, newContent)
        modifiedCount++
      }

      processedCount++

      // Show progress every 10 files
      if (processedCount % 10 === 0) {
        console.log(
          `  ⏳ Processed ${processedCount}/${jstsFiles.length} files...`,
        )
      }
    } catch (error) {
      console.error(
        `❌ Error processing ${
          NPath.relative(packagesDir, filePath)
        }: ${error}`,
      )
    }
  }

  console.log("━".repeat(50))
  console.log(`✅ Import resolution completed:`)
  console.log(`  📊 Total files processed: ${processedCount}`)
  console.log(`  ✏️  Files modified: ${modifiedCount}`)
  console.log(`  📁 Files unchanged: ${processedCount - modifiedCount}`)
}

/**
 * Replace imports of upstream dependencies with relative paths
 * This function scans all files in the packages directory and replaces imports
 * of packages that exist in our upstream packages with relative paths
 */
async function replaceUpstreamImports(
  packagesDir: string,
  packageNameToDir: Map<string, string>,
): Promise<void> {
  console.log(
    "\n🔄 Replacing upstream dependency imports with relative paths...",
  )
  console.log("━".repeat(50))

  const transpiler = new Bun.Transpiler({
    loader: "tsx",
  })

  // First, we need to remove upstream dependencies from all package.json files
  console.log("📦 Removing upstream dependencies from package.json files...")

  // Get all package.json files in packages directory
  const packageJsonFiles: string[] = []

  async function findPackageJsonFiles(dir: string) {
    const entries = await NFS.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = NPath.join(dir, entry.name)

      if (entry.isDirectory() && entry.name !== "node_modules") {
        await findPackageJsonFiles(fullPath)
      } else if (entry.isFile() && entry.name === "package.json") {
        packageJsonFiles.push(fullPath)
      }
    }
  }

  await findPackageJsonFiles(packagesDir)

  // Remove upstream dependencies from each package.json
  for (const packageJsonPath of packageJsonFiles) {
    try {
      const content = await Bun.file(packageJsonPath).text()
      const packageJson = JSON.parse(content)
      let modified = false

      // Check and remove from dependencies
      if (packageJson.dependencies) {
        for (const depName of Object.keys(packageJson.dependencies)) {
          if (packageNameToDir.has(depName)) {
            console.log(
              `  🗑️  Removing dependency "${depName}" from ${
                NPath.relative(packagesDir, packageJsonPath)
              }`,
            )
            delete packageJson.dependencies[depName]
            modified = true
          }
        }

        // Remove dependencies object if empty
        if (Object.keys(packageJson.dependencies).length === 0) {
          delete packageJson.dependencies
        }
      }

      // Check and remove from devDependencies
      if (packageJson.devDependencies) {
        for (const depName of Object.keys(packageJson.devDependencies)) {
          if (packageNameToDir.has(depName)) {
            console.log(
              `  🗑️  Removing devDependency "${depName}" from ${
                NPath.relative(packagesDir, packageJsonPath)
              }`,
            )
            delete packageJson.devDependencies[depName]
            modified = true
          }
        }

        // Remove devDependencies object if empty
        if (Object.keys(packageJson.devDependencies).length === 0) {
          delete packageJson.devDependencies
        }
      }

      if (modified) {
        await Bun.write(packageJsonPath, JSON.stringify(packageJson, null, 2))
        console.log(
          `  ✅ Updated ${NPath.relative(packagesDir, packageJsonPath)}`,
        )
      }
    } catch (error) {
      console.error(
        `❌ Error processing ${
          NPath.relative(packagesDir, packageJsonPath)
        }: ${error}`,
      )
    }
  }

  // Find all JavaScript/TypeScript files
  const jstsFiles: string[] = []

  async function findFiles(dir: string) {
    const entries = await NFS.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = NPath.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules directories
        if (entry.name === "node_modules") continue
        await findFiles(fullPath)
      } else if (entry.isFile()) {
        // Check for JS/TS files
        const ext = NPath.extname(entry.name).toLowerCase()
        if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
          jstsFiles.push(fullPath)
        }
      }
    }
  }

  await findFiles(packagesDir)
  console.log(
    `\n📋 Found ${jstsFiles.length} JavaScript/TypeScript files to process for upstream imports`,
  )

  let processedCount = 0
  let modifiedCount = 0

  for (const filePath of jstsFiles) {
    try {
      const content = await Bun.file(filePath).text()
      const fileDir = NPath.dirname(filePath)

      // Use Bun.Transpiler to scan for imports
      const imports = transpiler.scanImports(content)

      let modified = false
      let newContent = content

      // Process each import found
      for (const imp of imports) {
        // Skip relative imports
        if (imp.path.startsWith(".")) continue

        // Check if this import is for one of our upstream packages
        const pathParts = imp.path.split("/")
        if (pathParts.length === 0) continue

        const packageName = pathParts[0]
        if (!packageName) continue

        const fullPackageName = imp
            .path
            .startsWith("@") && pathParts.length >= 2
          ? pathParts.slice(0, 2).join("/")
          : packageName

        if (packageNameToDir.has(fullPackageName)) {
          const targetDirName = packageNameToDir.get(fullPackageName)!
          const targetPackageDir = NPath.join(packagesDir, targetDirName)

          // Handle subpath imports (e.g., "preact/hooks" -> "./preact/hooks")
          const subpath = imp.path.substring(fullPackageName.length)

          try {
            // Try to resolve the import to find the actual file
            let resolvedPath: string | null = null

            if (subpath) {
              // For subpath imports, try to resolve within the target package
              const subpathWithoutSlash = subpath.startsWith("/")
                ? subpath.substring(1)
                : subpath

              // First, check if there's a matching export in the target package.json
              const targetPackageJsonPath = NPath.join(
                targetPackageDir,
                "package.json",
              )
              if (NFS.existsSync(targetPackageJsonPath)) {
                const targetPackageJson = JSON.parse(
                  await Bun.file(targetPackageJsonPath).text(),
                )

                // Check if there's an export for this subpath
                if (targetPackageJson.exports) {
                  const exportKey = `./${subpathWithoutSlash}`
                  const exportEntry = targetPackageJson.exports[exportKey]

                  if (exportEntry) {
                    if (typeof exportEntry === "string") {
                      resolvedPath = NPath.join(targetPackageDir, exportEntry)
                    } else if (typeof exportEntry === "object") {
                      // Try different conditions in order of preference
                      const conditions = ["import", "browser", "default"]
                      for (const condition of conditions) {
                        if (exportEntry[condition]) {
                          resolvedPath = NPath.join(
                            targetPackageDir,
                            exportEntry[condition],
                          )
                          break
                        }
                      }
                    }
                  }
                }
              }

              // If not found in exports, try common patterns
              if (!resolvedPath) {
                // Try different file extensions and patterns
                const patterns = [
                  // Direct file match
                  subpathWithoutSlash,
                  `${subpathWithoutSlash}.ts`,
                  `${subpathWithoutSlash}.tsx`,
                  `${subpathWithoutSlash}.js`,
                  `${subpathWithoutSlash}.jsx`,
                  `${subpathWithoutSlash}.mjs`,
                  `${subpathWithoutSlash}.cjs`,
                  // Index files in subdirectory
                  `${subpathWithoutSlash}/index.ts`,
                  `${subpathWithoutSlash}/index.tsx`,
                  `${subpathWithoutSlash}/index.js`,
                  `${subpathWithoutSlash}/index.jsx`,
                  `${subpathWithoutSlash}/index.mjs`,
                  `${subpathWithoutSlash}/index.cjs`,
                  // Source directory patterns
                  `${subpathWithoutSlash}/src/index.ts`,
                  `${subpathWithoutSlash}/src/index.tsx`,
                  `${subpathWithoutSlash}/src/index.js`,
                  `${subpathWithoutSlash}/src/index.jsx`,
                ]

                for (const pattern of patterns) {
                  const testPath = NPath.join(targetPackageDir, pattern)
                  if (
                    NFS.existsSync(testPath) && NFS.statSync(testPath).isFile()
                  ) {
                    resolvedPath = testPath
                    break
                  }
                }
              }
            } else {
              // For main package imports, try to resolve using package.json exports or main field
              const targetPackageJsonPath = NPath.join(
                targetPackageDir,
                "package.json",
              )
              if (NFS.existsSync(targetPackageJsonPath)) {
                const targetPackageJson = JSON.parse(
                  await Bun.file(targetPackageJsonPath).text(),
                )

                // Try to find the main entry point
                if (targetPackageJson.exports) {
                  if (typeof targetPackageJson.exports === "string") {
                    resolvedPath = NPath.join(
                      targetPackageDir,
                      targetPackageJson.exports,
                    )
                  } else if (targetPackageJson.exports["."]) {
                    const exportValue = targetPackageJson.exports["."]
                    if (typeof exportValue === "string") {
                      resolvedPath = NPath.join(targetPackageDir, exportValue)
                    } else if (exportValue.import) {
                      resolvedPath = NPath.join(
                        targetPackageDir,
                        exportValue.import,
                      )
                    } else if (exportValue.browser) {
                      resolvedPath = NPath.join(
                        targetPackageDir,
                        exportValue.browser,
                      )
                    }
                  }
                }

                // Fallback to common entry points
                if (!resolvedPath) {
                  const entryPoints = [
                    "./src/index.ts",
                    "./src/index.tsx",
                    "./src/index.js",
                    "./src/index.jsx",
                    "./index.ts",
                    "./index.tsx",
                    "./index.js",
                    "./index.jsx",
                  ]

                  for (const entry of entryPoints) {
                    const testPath = NPath.join(targetPackageDir, entry)
                    if (NFS.existsSync(testPath)) {
                      resolvedPath = testPath
                      break
                    }
                  }
                }
              }
            }

            if (!resolvedPath) {
              // If we couldn't resolve to a specific file, check if it's a bare import
              // that should resolve to the package root
              if (!subpath) {
                // For main package imports, point to the package directory
                resolvedPath = targetPackageDir
              } else {
                // For subpath imports that couldn't be resolved, log a warning
                console.warn(
                  `  ⚠️  Could not resolve subpath "${subpath}" for package "${fullPackageName}". Import path: "${imp.path}"`,
                )
                continue
              }
            }

            // Convert to relative path from the current file
            let relativePath = NPath.relative(fileDir, resolvedPath)

            // Ensure the path starts with ./ or ../
            if (!relativePath.startsWith(".")) {
              relativePath = "./" + relativePath
            }

            // Keep file extensions - don't remove them
            // const ext = NPath.extname(relativePath).toLowerCase()
            // if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
            //   relativePath = relativePath.slice(0, -ext.length)
            // }

            // Create regex patterns to match the import
            const importRegex = new RegExp(
              `(from\\s+['"\`])(${
                imp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              })(['"\`])`,
              "g",
            )

            const dynamicImportRegex = new RegExp(
              `(import\\s*\\(\\s*['"\`])(${
                imp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              })(['"\`]\\s*\\))`,
              "g",
            )

            const requireRegex = new RegExp(
              `(require\\s*\\(\\s*['"\`])(${
                imp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              })(['"\`]\\s*\\))`,
              "g",
            )

            const beforeReplace = newContent
            newContent = newContent.replace(importRegex, `$1${relativePath}$3`)
            newContent = newContent.replace(
              dynamicImportRegex,
              `$1${relativePath}$3`,
            )
            newContent = newContent.replace(requireRegex, `$1${relativePath}$3`)

            if (newContent !== beforeReplace) {
              console.log(
                `  📝 ${
                  NPath.relative(packagesDir, filePath)
                }: "${imp.path}" → "${relativePath}"`,
              )
              modified = true
            }
          } catch (resolveError) {
            console.warn(
              `  ⚠️  Could not resolve upstream import "${imp.path}" in ${
                NPath.relative(packagesDir, filePath)
              }: ${resolveError}`,
            )
          }
        }
      }

      // Write the file back if it was modified
      if (modified) {
        await Bun.write(filePath, newContent)
        modifiedCount++
      }

      processedCount++

      // Show progress every 10 files
      if (processedCount % 10 === 0) {
        console.log(
          `  ⏳ Processed ${processedCount}/${jstsFiles.length} files...`,
        )
      }
    } catch (error) {
      console.error(
        `❌ Error processing ${
          NPath.relative(packagesDir, filePath)
        }: ${error}`,
      )
    }
  }

  console.log("━".repeat(50))
  console.log(`✅ Upstream import replacement completed:`)
  console.log(`  📊 Total files processed: ${processedCount}`)
  console.log(`  ✏️  Files modified: ${modifiedCount}`)
  console.log(`  📁 Files unchanged: ${processedCount - modifiedCount}`)
}

// Main execution
async function main() {
  console.log(`🚀 Starting copy process for all packages to ${PackagesDir}`)

  // Get all package information
  const packageInfo = await getPackageInfo()

  if (packageInfo.length === 0) {
    console.error("❌ No packages found")
    process.exit(1)
  }

  console.log(
    `📦 Found ${packageInfo.length} packages: ${
      packageInfo
        .map(p => p.directoryName)
        .join(", ")
    }`,
  )

  // Build mapping from package.json name to directory name
  const packageNameToDir = new Map<string, string>()
  for (const pkg of packageInfo) {
    packageNameToDir.set(pkg.packageJsonName, pkg.directoryName)
    console.log(`📋 Mapping: "${pkg.packageJsonName}" → "${pkg.directoryName}"`)
  }

  // Clean up existing packages directory
  await cleanupExistingArtifacts()

  // Create packages directory
  const packagesDirPath = NPath.resolve(PackagesDir)
  try {
    await Bun.$`mkdir -p ${packagesDirPath}`
    console.log(`📁 Created ${PackagesDir} directory`)
  } catch (error) {
    console.error(`❌ Failed to create ${PackagesDir}: ${error}`)
    process.exit(1)
  }

  // Copy all packages
  let successCount = 0
  let failureCount = 0

  for (const pkg of packageInfo) {
    console.log(`\n🔄 Processing package: ${pkg.directoryName}`)
    console.log("━".repeat(50))

    const success = await copyPackageToPackagesDir(
      pkg.path,
      pkg.directoryName,
      packageNameToDir,
    )
    if (success) {
      successCount++
    } else {
      failureCount++
    }

    console.log("━".repeat(50))
  }

  // Show final directory structure
  console.log(`\n📋 Final ${PackagesDir} structure:`)
  try {
    const finalStructure = await Bun.$`find ${PackagesDir} -type f`.text()
    console.log(finalStructure)
  } catch (error) {
    console.error("Could not list final structure")
  }

  // Resolve all relative imports in the copied files
  await resolveRelativeImports(packagesDirPath)

  // Replace upstream imports with relative paths
  await replaceUpstreamImports(packagesDirPath, packageNameToDir)

  // Final summary
  console.log(`\n📊 Final Summary:`)
  console.log(
    `✅ Successfully copied: ${successCount} packages to ${PackagesDir}`,
  )
  if (failureCount > 0) {
    console.log(`❌ Failed to copy: ${failureCount} packages`)
  }
  console.log(`🎉 Copy process completed!`)

  if (failureCount > 0) {
    process.exit(1)
  }
}

// Run the script
main().catch((error) => {
  console.error("❌ Script failed:", error)
  process.exit(1)
})
