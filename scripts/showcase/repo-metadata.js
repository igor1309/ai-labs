export function createMetadataSync({ run }) {
  return function syncMetadata({ repo, description, homepage, topics }, { cwd }) {
    // Topics the settings no longer list are removed, so the public repo's
    // topics are exactly the settings' topics.
    const { repositoryTopics } = JSON.parse(run('gh', ['repo', 'view', repo, '--json', 'repositoryTopics'], { cwd }).toString());
    const remove = (repositoryTopics ?? []).map(({ name }) => name).filter((topic) => !topics.includes(topic));
    run('gh', ['repo', 'edit', repo, '--description', description, '--homepage', homepage,
      ...topics.flatMap((topic) => ['--add-topic', topic]), ...remove.flatMap((topic) => ['--remove-topic', topic])], { cwd });
  };
}
