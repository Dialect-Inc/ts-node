import type * as ts from 'typescript';
import * as path from 'path';
import isPathInside = require('is-path-inside')
import findUp = require('find-up')
import tsConfigPaths = require('tsconfig-paths')
import * as fs from 'fs'

// Path mapper returns a list of mapped specifiers or `null` if the
// given `specifier` was not mapped.
type PathMapper = (specifier: string, parentPath: string) => string[] | null;

export function createPathMapper(
  compilerOptions: ts.CompilerOptions
): PathMapper {
  const tsconfigPathToMatchPath: Record<
    string,
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    import('tsconfig-paths').MatchPath
  > = {};

  if (compilerOptions.baseUrl) {
    return function map(specifier: string, parentPath: string): string[] | null {
      console.log(specifier, parentPath)
      let tsconfigPath: string | undefined;

      const filePathOfImporter = parentPath

      // Check all the existing parent folders of each known `tsconfig.json` file and see
      // if the current file's directory falls under a known directory containing a
      // `tsconfig.json` file
      for (const knownTsconfigPath of Object.keys(tsconfigPathToMatchPath).sort(
        (a, b) => a.length - b.length
      )) {
        if (isPathInside(filePathOfImporter, path.dirname(knownTsconfigPath))) {
          tsconfigPath = knownTsconfigPath;
        }
      }

      // If we couldn't find an cached `tsconfig.json` which is associated with the current file, then we search for it by finding the nearest `tsconfig.json` in an above directory
      if (tsconfigPath === undefined) {
        const tsconfigJsonPath = findUp.sync('tsconfig.json', {
          cwd: path.dirname(filePathOfImporter),
        });
        if (tsconfigJsonPath !== undefined) {
          const config = tsConfigPaths.loadConfig(tsconfigJsonPath);
          if (config.resultType === 'failed') {
            throw new Error('Failed to load tsconfig');
          }

          const { absoluteBaseUrl, paths } = config;
          let matchPath: tsConfigPaths.MatchPath;
          if (paths === undefined) {
            matchPath = () => undefined;
          } else {
            matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);
          }

          tsconfigPathToMatchPath[tsconfigJsonPath] = matchPath;

          tsconfigPath = tsconfigJsonPath;
        }
      }

      let matchPath: tsConfigPaths.MatchPath;
      if (tsconfigPath === undefined) {
        const config = tsConfigPaths.loadConfig();
        if (config.resultType === 'failed') {
          throw new Error('Failed to load tsconfig');
        }

        const { paths, absoluteBaseUrl } = config;
        if (paths === undefined) {
          matchPath = () => undefined;
        } else {
          matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);
        }
      } else {
        matchPath = tsconfigPathToMatchPath[tsconfigPath]!;
      }

      const extensions: Record<string, string[]> = {
        '.js': ['.js', '.ts'],
        '.jsx': ['.jsx', '.tsx'],
        '.cjs': ['.cjs', '.cts'],
        '.mjs': ['.mjs', '.mts'],
        '.json': ['.json']
      }

      let specifierExtension = path.parse(specifier).ext
      let extensionsToCheck: string[] = ['.js', '.ts', '.jsx', '.tsx', '.cjs', '.cts', '.mjs', '.mts', '.json']
      let fileMatchPath: string | undefined;

      if (Object.keys(extensions).includes(specifierExtension)) {
        extensionsToCheck = extensions[specifierExtension]
        const trimmedSpecifier = specifier.slice(0, specifier.length - specifierExtension.length)
        fileMatchPath = matchPath(trimmedSpecifier);
      } else {
        fileMatchPath = matchPath(specifier)
      }

      if (fileMatchPath !== undefined) {
        for (const extension of extensionsToCheck) {
          const filePath = `${fileMatchPath}${extension}`;
          if (fs.existsSync(filePath)) {
            return [filePath];
          }
        }
      }

      return null
    };
  } else {
    return () => null;
  }
}
