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
  structUtils,
  Manifest,
  ProjectLookup
} from '@yarnpkg/core';
import { getPluginConfiguration } from "@yarnpkg/cli";

import { xfs, ppath, Filename } from "@yarnpkg/fslib";

const createLockfile = async (
  rootProject: Project,
  { cwd }: Workspace,
  // report: StreamReport
) => {
  const configuration = await Configuration.find(
      cwd,
      getPluginConfiguration(),
      {
        lookup: ProjectLookup.MANIFEST
      }
  );

  const cache = await Cache.find(configuration);
  const { project, workspace: projectWorkspace } = await Project.find(configuration, cwd);

  project.originalPackages = new Map(rootProject.originalPackages);
  project.storedResolutions = new Map(rootProject.storedResolutions);

  const requiredWorkspaces: Set<Workspace> = new Set([projectWorkspace]);

  // First we compute the dependency chain to see what workspaces are
  // dependencies of the one we're trying to focus on.
  //
  // Note: remember that new elements can be added in a set even while
  // iterating over it (because they're added at the end)

  for (const workspace of requiredWorkspaces) {
    for (const dependencyType of Manifest.hardDependencies) {
      for (const descriptor of workspace.manifest
          .getForScope(dependencyType)
          .values()) {
        const matchingWorkspace = project.tryWorkspaceByDescriptor(descriptor);

        if (matchingWorkspace === null) continue;

        requiredWorkspaces.add(matchingWorkspace);
      }
    }
  }

  await project.resolveEverything({
    cache,
    report: new ThrowReport()
  });

  await project.fetchEverything({
    cache,
    report: new ThrowReport()
  });

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
              await createLockfile(project, workspace)
            );

            report.reportInfo(null, `${green(`✓`)} Wrote ${lockPath}`);
          }
        }
      );
    },
  },
};

export default plugin;
