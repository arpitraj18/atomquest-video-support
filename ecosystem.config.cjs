module.exports = {
  apps: [
    {
      name: 'atomquest-server',
      script: 'npm',
      args: 'run start --workspace server',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // Replace with your actual domain when deploying
        PUBLIC_URL: 'https://support.atomberg.com',
      },
    },
  ],
};
