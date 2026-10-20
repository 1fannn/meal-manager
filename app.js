const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// 设置 EJS 模板引擎
app.set("view engine", "ejs");

// 解析表单数据
app.use(express.urlencoded({ extended: true }));

// 静态文件目录
app.use(express.static("public"));

// 数据结构：Meal Manager
let meals = [];

// 首页路由
app.get("/", (req, res) => {
  res.render("index");
});

// 餐点列表路由
app.get("/meals", (req, res) => {
  res.render("meals", { meals });
});

// 显示添加餐点表单 / Show Add Meal Form
app.get("/meals/add", (req, res) => {
  res.render("addMeal");
});

// 处理表单提交 / Handle Form Submission
app.post("/meals/add", (req, res) => {
  const newMeal = {
    name: req.body.name,
    location: req.body.location,
    rating: req.body.rating,
    comment: req.body.comment,
    favorite: false // 默认不收藏
  };
  meals.push(newMeal);
  res.redirect("/meals"); // 添加后跳转到餐点列表
});

// 显示编辑餐点表单 / Show Edit Meal Form
app.get("/meals/edit/:index", (req, res) => {
  const index = req.params.index;
  const meal = meals[index];
  if (!meal) return res.redirect("/meals");
  res.render("editMeal", { meal, index });
});

// 处理编辑提交 / Handle Edit Submission
app.post("/meals/edit/:index", (req, res) => {
  const index = req.params.index;
  meals[index] = {
    name: req.body.name,
    location: req.body.location,
    rating: req.body.rating,
    comment: req.body.comment,
    favorite: meals[index].favorite // 保留原来的收藏状态 / Keep original favorite status
  };
  res.redirect("/meals");
});

// 删除餐点 / Delete Meal
app.post("/meals/delete/:index", (req, res) => {
  const index = req.params.index;
  meals.splice(index, 1); // 从数组中移除该餐点 / Remove meal from array
  res.redirect("/meals"); // 删除后跳转回餐点列表 / Redirect back to meals list
});

// 切换收藏状态 / Toggle Favorite
app.post("/meals/favorite/:index", (req, res) => {
  const index = req.params.index;
  meals[index].favorite = !meals[index].favorite; // 切换 true/false
  res.redirect("/meals"); // 返回餐点列表
});


// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

