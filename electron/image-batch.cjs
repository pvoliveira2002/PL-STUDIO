async function runImageBatch({ files, job, convert, notify = () => {} }) {
  const results = [];
  const failures = [];

  for (let index = 0; index < files.length; index += 1) {
    if (job.cancelled) break;
    const file = files[index];
    notify({ status: 'processing', completed: index, current: index + 1, file, failed: failures.length });
    try {
      results.push(await convert(file, index));
    } catch (error) {
      failures.push({
        name: file.name,
        message: error?.message || 'Não foi possível converter esta imagem.',
      });
    }
    notify({ status: 'processing', completed: index + 1, current: index + 1, file, failed: failures.length });
  }

  const cancelled = job.cancelled;
  const processed = results.length + failures.length;
  notify({
    status: cancelled ? 'cancelled' : 'complete',
    completed: processed,
    current: Math.min(processed, files.length),
    file: null,
    failed: failures.length,
  });
  return { results, failures, cancelled, processed };
}

module.exports = { runImageBatch };
