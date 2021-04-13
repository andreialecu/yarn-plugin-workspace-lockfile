# yarn-plugin-workspace-lockfile

**EXPERIMENTAL!**

## Usage:

```
yarn plugin import https://unpkg.com/@openagenda/yarn-plugin-workspace-lockfile

yarn install
```

Creates a separate lockfile named `yarn.lock-workspace` in each workspace in a yarn 2+ project, containing only dependencies pertaining to that specific workspace.

This can be useful if you need to partition a big monorepo into smaller repos which you can share with individual developers, without giving them access to the entire code base.

You can set-up git submodules in the root monorepo, so that each workspace directory is an individual git repository.

Developers can then clone the repository they need to work on, and either rename `yarn.lock-workspace` to `yarn.lock` before installing, or they can create a `.yarnrc.yml` file that contains `lockfileFilename: yarn.lock-workspace`.
