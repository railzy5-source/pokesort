import { runFullAnalysis, type UserConfigInput } from './sorterEngine';

interface WorkerRequest {
  rawExport: unknown;
  userCfg: UserConfigInput | null | undefined;
  options: {
    useOfflineFallbackOnly?: boolean;
    forceRefreshCache?: boolean;
  };
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { rawExport, userCfg, options } = ev.data || {};
  try {
    const res = await runFullAnalysis(rawExport, userCfg, {
      useOfflineFallbackOnly: Boolean(options?.useOfflineFallbackOnly),
      forceRefreshCache: Boolean(options?.forceRefreshCache),
      onProgress: (progress) => {
        self.postMessage({ type: 'progress', progress });
      },
    });
    self.postMessage({ type: 'done', report: res.report, remote: res.remote });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Worker execution failed',
    });
  }
};
