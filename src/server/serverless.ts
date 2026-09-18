import createApp from './app.ts';

const app = createApp();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default app;
