const { Strategy: JwtStrategy, ExtractJwt } = require('jsonwebtoken');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      scope: ['user:email', 'repo'],
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: 'github', providerId: profile.id });
        if (!user) {
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
        done(err, null);
      }
    }));
  }

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ provider: 'google', providerId: profile.id });
        if (!user) {
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
        done(err, null);
      }
    }));
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
