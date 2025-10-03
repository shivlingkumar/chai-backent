import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accesToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accesToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went worng while generating refredh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation -not empty
  // check if user already exists : username, email
  // check for images, check for avatar
  // upload them to cloudinery , avatar
  // create user object - create entry in db
  // remove password and refresh token field for response
  // check for user creation
  // return res

  const { fullName, email, username, password } = req.body;
  //console.log("email:", email);

  // if (fullName === "") {
  //     throw new ApiError(400,"fullName is required")
  // }

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "all fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or usename alrady exjist");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  //const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  } else {
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }
  console.log(req.files);

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is requireds");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken "
  );

  if (!createdUser) {
    throw new ApiError(500, "Somthing went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //req body -> data
  // username or email
  // find the user
  // password check
  // access and refresh token
  // send cookie

  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const ispassswordValid = await user.isPasswordCorrect(password);

  if (!ispassswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }
  const { accesToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accesToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accesToken,
          refreshToken,
        },
        "User logged in Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken =
      req.cookie.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
      throw new ApiError(401, "Unauthorized request");
    }
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accesToken, newrefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accesToken, options)
      .cookie("refreshToken", newrefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accesToken, refreshToken: newrefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});


const changeCurrentPassword = asyncHandler(async(req,res) => {
  const {oldPassword,newPassword} = req.body

  const user = await User.findById(req.user?._id)
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordCorrect){
    throw new ApiError(400,"Invalid old Password")
  }

  user.password = newPassword
  await user.save({validateBeforeSave:false})

  return res
  .status(200)
  .json(new ApiResponse(200,{},"password change successyfully"))
})

const getCurrentUser = asyncHandler(async(req,res) =>{
  return res
  .status(200)
  .json(200,req.user,"current user fetched successfully")

})

const updateAccountDetails = asyncHandler(async(req,res) =>{
  const {fullName,email,username} = req.body

  if(!fullName || !email || username){
    throw new ApiError(400,"All fields are required")
  }

  const user =  User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullName,
        email,
        username
      }
    },
    {new:true}

  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req,res) =>{
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar files is missing")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading on avatar")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar:avatar.url

      }
    },
    {new:true}
  ).select("-password")
   
  return res
  .status(200)
  .json(
    new ApiResponse(200,user,"avatar image update successyfully")
  )


})

const updateUserCoverImage = asyncHandler(async(req,res) =>{
  const CoverImageLocalPath = req.file?.path

  if(!CoverImageLocalPath){
    throw new ApiError(400,"coverImage files is missing")
  }

  const coverImage = await uploadOnCloudinary(CoverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(400,"Error while uploading on coverImages")
  }

  const user =  await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverImage:coverImage.url

      }
    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(
    new ApiResponse(200, user ,"coverImage update successyfully")
  )


})




export { registerUser, loginUser,
   logoutUser , refreshAccessToken,
   changeCurrentPassword,getCurrentUser,
   updateAccountDetails,
   updateUserAvatar,updateUserCoverImage
   };
