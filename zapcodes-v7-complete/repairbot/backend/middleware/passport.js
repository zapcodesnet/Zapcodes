const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const githubCallbackURL = process.env.GITHUB_CALLBACK_URL ||
      `${process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:10000'}/api/auth/github/callback`;

    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: githubCallbackURL,
      scope: ['user:email', 'repo'],
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: 'github', providerId: profile.id });
        if (!user) {
          const existingEmail = await User.findOne({ email: profile.emails?.[0]?.value });
          if (existingEmail) {
            existingEmail.githubToken = accessToken;
            existingEmail.avatar = existingEmail.avatar || profile.photos?.[0]?.value || '';
            await existingEmail.save();
            return done(null, existingEmail);
          }
          user = await User.create({
            email: profile.emails?.[0]?.value || `${profile.username}@github.local`,
            name: profile.displayName || profile.username,
            avatar: profile.photos?.[0]?.value || '',
            provider: 'github',
            providerId: profile.id,
            githubToken: accessToken,
          });
        } else {
          user.githubToken = accessToken;
          await user.save();
        }
        done(null, user);
      } catch (err) {
        console.error('GitHub OAuth error:', err);
        done(err, null);
      }
    }));
    console.log('GitHub OAuth configured');
  } else {
    console.log('GitHub OAuth not configured (missing GITHUB_CLIENT_ID/SECRET)');
  }

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL ||
      `${process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:10000'}/api/auth/google/callback`;

    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackURL,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: 'google', providerId: profile.id });
        if (!user) {
          const existingEmail = await User.findOne({ email: profile.emails?.[0]?.value });
          if (existingEmail) {
            existingEmail.avatar = existingEmail.avatar || profile.photos?.[0]?.value || '';
            await existingEmail.save();
            return done(null, existingEmail);
          }
          user = await User.create({
            email: profile.emails?.[0]?.value,
            name: profile.displayName,
            avatar: profile.photos?.[0]?.value || '',
            provider: 'google',
            providerId: profile.id,
          });
        }
        done(null, user);
      } catch (err) {
        console.error('Google OAuth error:', err);
        done(err, null);
      }
    }));
    console.log('Google OAuth configured');
  } else {
    console.log('Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)');
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
