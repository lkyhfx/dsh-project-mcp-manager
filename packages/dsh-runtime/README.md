# dsh-mcp-runtime

Not a runtime: an empty package whose only job is to declare the DSH runtime
packages as ordinary dependencies.

`@deepseek-ai/dsh-mcp-client` declares its host (`@deepseek-ai/cordis`,
`dsh-scope`, `dsh-tools`, and the rest of the 0.2.1-rc.2 line) as peer
dependencies. DSH profiles are initialized with `autoInstallPeers: false`, so a
peer the profile does not already list is never installed, and the plugin fails
to load with `Cannot find package '@deepseek-ai/dsh-scope'`.

pnpm ships the contents of a local `file:` dependency inside the dependent
tarball, so declaring this package as `file:./packages/dsh-runtime` makes the
closure part of the plugin's own dependency graph. A profile that installs the
plugin gets a complete set without changing its pnpm settings.

The 0.2.1-rc.2 line peers transitively on everything listed here; the list was
computed from the npm metadata of the declared peers. Bump every version here
together with the host line in `package.json` (`engines.dsh`) and
`@deepseek-ai/dsh-mcp-client`; `test/test-bundle.mjs` checks the pins, and
`@deepseek-ai/cordis` must stay `4.0.5` because every DSH package peers on
`~4.0.5`.

The provider itself (`@deepseek-ai/dsh-mcp-client`) is not listed: the loader
already requires it, and listing it here would resolve a second instance with a
different peer set.
