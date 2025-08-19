import { User } from './User.js';
import { Post } from './Post.js';

// Define relationships
User.hasMany(Post, { 
  foreignKey: 'userId',
  as: 'posts'
});
Post.belongsTo(User, { 
  foreignKey: 'userId',
  as: 'user'
});

export { User, Post };