import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { sequelize, connectDB } from './models/index.js';
import './models/associations.js';
import { User } from './models/User.js';
import { Post } from './models/Post.js';

const app = express();
const port = 3000;
const PgSession = connectPgSimple(session);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  store: new PgSession({
    conObject: {
      host: process.env.PG_HOST,
      port: process.env.PG_PORT,
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
    },
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'xyz123',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session.userId ? { id: req.session.userId, username: req.session.username } : null;
  next();
});

// =================== AUTHENTICATION ROUTES ===================

// Login page
app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render("login.ejs", { error: null });
});

// Register page
app.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render("register.ejs", { error: null });
});

// Register user
app.post("/register", async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;
    
    if (password !== confirmPassword) {
      return res.render("register.ejs", { error: "Passwords don't match" });
    }
    
    if (password.length < 6) {
      return res.render("register.ejs", { error: "Password must be at least 6 characters" });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.render("register.ejs", { error: "Username already exists" });
    }
    
    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      password: hashedPassword
    });
    
    // Auto-login after registration
    req.session.userId = newUser.id;
    req.session.username = newUser.username;
    res.redirect('/');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.render("register.ejs", { error: "Registration failed. Please try again." });
  }
});

// Login user
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.render("login.ejs", { error: "Invalid username or password" });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.render("login.ejs", { error: "Invalid username or password" });
    }
    
    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect('/');
    
  } catch (error) {
    console.error('Login error:', error);
    res.render("login.ejs", { error: "Login failed. Please try again." });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Could not log out');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// =================== BLOG ROUTES ===================

// Home page - View all blogs (read-only for logged-in users)
app.get("/", async (req, res) => {
  try {
    const blogs = await Post.findAll({
      include: [{
        model: User,
        as: 'user',
        attributes: ['username']
      }],
      order: [['createdAt', 'DESC']]
    });
    
    res.render("index.ejs", {
      blogs: blogs,
      isLoggedIn: !!req.session.userId
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.render("index.ejs", { blogs: [], isLoggedIn: !!req.session.userId });
  }
});

// My Blogs page - User's own blogs with full CRUD
app.get("/my-blogs", requireAuth, async (req, res) => {
  try {
    const myBlogs = await Post.findAll({
      where: { userId: req.session.userId },
      order: [['createdAt', 'DESC']]
    });
    
    res.render("my-blogs.ejs", {
      blogs: myBlogs,
      username: req.session.username
    });
  } catch (error) {
    console.error('Error fetching user blogs:', error);
    res.render("my-blogs.ejs", { blogs: [], username: req.session.username });
  }
});

// Create blog page
app.get("/create-blog", requireAuth, (req, res) => {
  res.render("create.ejs");
});

// Submit blog
app.post("/submit-blog", requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    
    await Post.create({
      title: title,
      content: content,
      author: req.session.username,
      userId: req.session.userId
    });
    
    res.redirect('/my-blogs');
  } catch (error) {
    console.error('Error creating blog:', error);
    res.redirect('/create-blog');
  }
});

// View single blog
app.get("/blog/:id", async (req, res) => {
  try {
    const blog = await Post.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['username']
      }]
    });
    
    if (!blog) {
      return res.status(404).send('Blog not found');
    }
    
    // Check if user owns this blog
    const canEdit = req.session.userId && req.session.userId === blog.userId;
    
    res.render("view.ejs", {
      blog: blog,
      canEdit: canEdit
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).send('Error loading blog');
  }
});

// Edit blog page (only for owner)
app.get("/edit-blog/:id", requireAuth, async (req, res) => {
  try {
    const blog = await Post.findByPk(req.params.id);
    
    if (!blog) {
      return res.status(404).send('Blog not found');
    }
    
    // Check if user owns this blog
    if (blog.userId !== req.session.userId) {
      return res.status(403).send('Access denied');
    }
    
    res.render("edit.ejs", { blog: blog });
  } catch (error) {
    console.error('Error fetching blog for edit:', error);
    res.status(500).send('Error loading blog');
  }
});

// Update blog (only for owner)
app.post("/edit-blog/:id", requireAuth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const blog = await Post.findByPk(req.params.id);
    
    if (!blog || blog.userId !== req.session.userId) {
      return res.status(403).send('Access denied');
    }
    
    await Post.update(
      { title, content },
      { where: { id: req.params.id } }
    );
    
    res.redirect('/my-blogs');
  } catch (error) {
    console.error('Error updating blog:', error);
    res.redirect(`/edit-blog/${req.params.id}`);
  }
});

// Delete blog (only for owner)
app.post("/delete-blog/:id", requireAuth, async (req, res) => {
  try {
    const blog = await Post.findByPk(req.params.id);
    
    if (!blog || blog.userId !== req.session.userId) {
      return res.status(403).send('Access denied');
    }
    
    await Post.destroy({ where: { id: req.params.id } });
    res.redirect('/my-blogs');
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.redirect('/my-blogs');
  }
});

// Initialize database and start server
const startServer = async () => {
  const connected = await connectDB();
  
  if (!connected) {
    console.error('Cannot start server without database connection');
    process.exit(1);
  }
  
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ Database tables synced');
    
    app.listen(port, () => {
      console.log(`🚀 Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  }
};

startServer();