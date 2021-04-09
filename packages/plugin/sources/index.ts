import {
  Plugin,
  Hooks,
  Project,
  Configuration,
  Cache,
  Workspace,
  StreamReport,
  ThrowReport,
  SettingsType,
  SettingsDefinition,
  structUtils
} from '@yarnpkg/core';
import { getPluginConfiguration } from "@yarnpkg/cli";

import { xfs, ppath, Filename } from "@yarnpkg/fslib";

const createLockfile = async (
  configuration: Configuration,
  { cwd }: Workspace
) => {
  const { project, workspace } = await Project.find(configuration, cwd);
  const cache = await Cache.find(configuration);

  let requiredWorkspaces: Set<Workspace> = new Set([workspace]);

  // First we compute the dependency chain to see what workspaces are
  // dependencies of the one we're trying to focus on.
  //
  // Note: remember that new elements can be added in a set even while
  // iterating over it (because they're added at the end)

  // DISABLED:

  // for (const workspace of requiredWorkspaces) {
  //   for (const dependencyType of Manifest.hardDependencies) {
  //     for (const descriptor of workspace.manifest
  //       .getForScope(dependencyType)
  //       .values()) {
  //       const matchingWorkspace = project.tryWorkspaceByDescriptor(descriptor);

  //       if (matchingWorkspace === null) continue;

  //requiredWorkspaces.add(matchingWorkspace);
  //     }
  //   }
  // }

  // remove any workspace that isn't a dependency, iterate in reverse so we can splice it
  for (let i = project.workspaces.length - 1; i >= 0; i--) {
    const currentWorkspace = project.workspaces[i];
    if (!requiredWorkspaces.has(currentWorkspace)) {
      project.workspaces.splice(i, 1);
    }
  }

  await project.resolveEverything({
    cache,
    report: new ThrowReport(),
  });

  for (const w of project.workspaces) {
    const pkg = Array.from(project.originalPackages.values()).find(
      (p) => p.identHash === w.locator.identHash
    );
    if (pkg?.reference.startsWith("workspace:")) {
      // ensure we replace the path in the lockfile from `workspace:packages/somepath` to `workspace:.`
      if (w.cwd === cwd) {
        pkg.reference = `workspace:.`;

        Array.from(project.storedDescriptors.values()).find(
          (v) => v.identHash === pkg.identHash
        ).range = `workspace:.`;
      }
    }
  }

  return project.generateLockfile();
};

const green = (text: string) => `\x1b[32m${text}\x1b[0m`;

const plugin: Plugin<Hooks> = {
  configuration: {
    workspaceLockfiles: {
      description: 'List of the workspaces that need a specific lockfile',
      type: SettingsType.STRING,
      default: true,
      isArray: true
    },
    workspaceLockfileName: {
      description: 'Name of the workspaces specific lockfile',
      type: SettingsType.STRING,
      default: 'yarn.lock-workspace'
    }
  } as {[settingName: string]: SettingsDefinition},
  hooks: {
    afterAllInstalled: async (project) => {
      const configuration = await Configuration.find(
        project.cwd,
        getPluginConfiguration()
      );

      const workspaceLockfiles = configuration.values.get('workspaceLockfiles');
      const workspaceLockfileName = configuration.values.get('workspaceLockfileName');

      await StreamReport.start(
        {
          configuration,
          stdout: process.stdout,
          includeLogs: true,
        },
        async (report: StreamReport) => {
          const requiredWorkspaces: Set<Workspace> = Array.isArray(workspaceLockfiles)
              ? new Set(workspaceLockfiles.map(name => project.getWorkspaceByIdent(structUtils.parseIdent(name))))
              : new Set(project.workspaces);

          for (const workspace of requiredWorkspaces) {
            const lockPath = ppath.join(
              workspace.cwd,
              workspaceLockfileName as Filename
            );

            await xfs.writeFilePromise(
              lockPath,
              await createLockfile(configuration, workspace)
            );
            report.reportInfo(null, `${green(`✓`)} Wrote ${lockPath}`);
          }
        }
      );
    },
  },
};

export default plugin;
