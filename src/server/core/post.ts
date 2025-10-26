import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }

  return await reddit.submitCustomPost({
    splash: {
      // Splash Screen Configuration
      appDisplayName: 'The DiggerMan',
      appIconUri: 'appicon.png',
      backgroundUri: 'splash.png',
      buttonLabel: 'Play',
      description: 'Descend into the depths and uncover legendary riches.',
      entryUri: 'index.html',
      heading: 'The DiggerMan',
    },
    subredditName: subredditName,
    title: 'TheDigger - Incremental Digging Game',
  });
};
