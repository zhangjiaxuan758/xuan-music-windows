// electron/updateChannels.cjs
// Resolves the user-facing release lane to the electron-updater channel stored in packaged metadata.

const RELEASE_CHANNELS = {
  stable: {
    id: 'stable',
    label: '小轩音乐 · 正式版',
    updaterChannel: 'latest',
    allowPrerelease: false,
    updateEnabled: true,
    rollingReleaseTag: null,
  },
  preview: {
    id: 'preview',
    label: '小轩音乐 · 预览版',
    updaterChannel: 'beta',
    allowPrerelease: true,
    updateEnabled: true,
    rollingReleaseTag: 'preview',
  },
  canary: {
    id: 'canary',
    label: '小轩音乐 · 内测版',
    updaterChannel: 'alpha',
    allowPrerelease: true,
    updateEnabled: true,
    rollingReleaseTag: 'canary',
  },
  internal: {
    id: 'internal',
    label: 'Internal',
    updaterChannel: null,
    allowPrerelease: false,
    updateEnabled: false,
    rollingReleaseTag: null,
  },
};

function normalizeReleaseChannel(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function resolveReleaseChannel(version, declaredChannel) {
  const declared = normalizeReleaseChannel(declaredChannel);
  if (RELEASE_CHANNELS[declared]) {
    return RELEASE_CHANNELS[declared];
  }

  const normalizedVersion = typeof version === 'string' ? version.toLowerCase() : '';
  if (/-alpha(?:[.\-]|$)/.test(normalizedVersion)) {
    return RELEASE_CHANNELS.canary;
  }
  if (/-beta(?:[.\-]|$)/.test(normalizedVersion)) {
    return RELEASE_CHANNELS.preview;
  }
  return RELEASE_CHANNELS.stable;
}

function getReleaseUrl(channel, version, releasesUrl) {
  const release = resolveReleaseChannel(version, channel);
  if (release.rollingReleaseTag) {
    return `${releasesUrl}/tag/${release.rollingReleaseTag}`;
  }

  const normalizedVersion = typeof version === 'string' ? version.trim().replace(/^v/i, '') : '';
  return normalizedVersion ? `${releasesUrl}/tag/v${normalizedVersion}` : releasesUrl;
}

// Builds a provider configuration for the official update server.
function getUpdateProviderConfig(releaseChannel, repository) {
  if (!releaseChannel?.updateEnabled) {
    return null;
  }

  if (releaseChannel.rollingReleaseTag) {
    return {
      provider: 'generic',
      url: `https://music.jrr.lol/download/`,
      channel: releaseChannel.updaterChannel,
      useMultipleRangeRequest: false,
    };
  }

  return {
    provider: 'generic',
    owner: repository.owner,
    repo: repository.repo,
    channel: releaseChannel.updaterChannel,
  };
}

module.exports = {
  RELEASE_CHANNELS,
  getReleaseUrl,
  getUpdateProviderConfig,
  resolveReleaseChannel,
};
