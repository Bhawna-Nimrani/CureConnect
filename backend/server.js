import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import adminRouter from "./routes/adminRoute.js";
import doctorRouter from "./routes/doctorRoute.js";
import userRouter from "./routes/userRoute.js";
import doctorModel from "./models/doctorModel.js";

dotenv.config(); // Load environment variables

const app = express();
const port = process.env.PORT || 4008;

// Middlewares
app.use(express.json());
app.use(cors());

connectDB(); // Connect to MongoDB
connectCloudinary();

app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/doctor", doctorRouter);

app.get("/", (req, res) => {
  res.send("API Working great ");
});

app.get("/test", async (req, res) => {
  const data = await doctorModel.find({});
  res.json(data);
});

app.post("/dialogflow", async (req, res) => {
  const query = req.body;
  const doctor = query.queryResult.parameters.doctors || "";
  const location = query.queryResult.parameters["geo-city"] || "";
  const currency = query.queryResult.parameters["unit-currency"] || {
    amount: 0,
  };
  const fees = currency.amount || 0;
  const years = query.queryResult.parameters["duration"] || { amount: 0 };
  const duration = years.amount || 0;

  const data = await doctorModel.find({});
  if ((Array.isArray(doctor) && doctor.length === 0) || doctor === "") {
    res.json({
      fulfillmentMessages: [
        {
          text: {
            text: ["Please specify your doctor"],
          },
        },
      ],
    });
    return res.end();
  }

  const matchingDoctors = data.filter(
    (item) =>
      item.speciality?.replace(/\s+/g, "").toLowerCase() ===
      doctor[0].replace(/\s+/g, "").toLowerCase()
  );

  try {
    if (matchingDoctors.length === 0) {
      throw new Error("No doctors found");
    }

    const locationResult = matchingDoctors.filter((doctor) => {
      const { line1, line2 } = doctor.address;
      return (
        line1.toLowerCase().includes(location.toLowerCase()) ||
        line2.toLowerCase().includes(location.toLowerCase())
      );
    });

    if (location !== "" && locationResult.length === 0) {
      throw new Error("No doctors match your criteria");
    }

    const filteredList = locationResult.length
      ? locationResult
      : matchingDoctors;

    const feeList = filteredList.filter(
      ({ fees: fee }) => fees === 0 || fee <= fees
    );

    if (fees !== 0 && feeList.length === 0) {
      throw new Error("No doctors match your criteria");
    }

    const prefinalList = feeList.length ? feeList : filteredList;

    const experienceList = prefinalList.filter(
      (item) => Number(item.experience[0]) >= Number(String(duration))
    );
    const finalList = experienceList.length ? experienceList : prefinalList;

    if (finalList.length === 0) {
      throw new Error("No doctors match your criteria");
    }

    const payload = finalList.map((doctor) => [
      {
        type: "image",
        rawUrl: doctor.image || "https://example.com/default-doctor.png",
        accessibilityText: `Image of ${doctor.name}`,
      },
      {
        type: "info",
        title: doctor.name,
        subtitle: `Fees: Rs.${doctor.fees} | Experience : ${doctor.experience} `,
        actionLink: doctor.profileUrl,
      },
      {
        type: "chips",
        options: [
          {
            text: "Book Appointment",
            link: `http://localhost:5173/appointment/${doctor.id}`,
          },
          {
            text: "Show Address on Map",
            link:
              "https://www.google.com/maps?q=" +
              encodeURIComponent(
                doctor.address.line1 + " " + doctor.address.line2
              ),
          },
        ],
      },
    ]);

    res.json({
      fulfillmentMessages: [
        {
          text: {
            text: [`Found ${finalList.length} doctors matching your criteria:`],
          },
        },
        {
          payload: {
            richContent: payload,
          },
        },
      ],
    });
  } catch (err) {
    console.error(err.message);
    res.json({
      fulfillmentMessages: [
        {
          text: {
            text: ["Sorry, no doctors found matching your search criteria."],
          },
        },
      ],
    });
  }
});

app.listen(port, () => console.log(`Server started on PORT:${port}`));
