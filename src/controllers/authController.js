const AuthService = require('../services/authService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const result = await AuthService.register(req.body);
  return ApiResponse.created(res, 'User registered successfully', result);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await AuthService.login(email, password);
  return ApiResponse.success(res, 'Login successful', result);
});

const getMe = asyncHandler(async (req, res) => {
  const user = await AuthService.getCurrentUser(req.user._id);
  return ApiResponse.success(res, 'User profile fetched successfully', user);
});

const logout = asyncHandler(async (req, res) => {
  // Stateless JWT logout confirmation
  return ApiResponse.success(res, 'Logged out successfully');
});

module.exports = {
  register,
  login,
  getMe,
  logout
};
