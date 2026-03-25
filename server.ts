import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const firebaseApp = initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe Webhook (Must be before express.json())
  app.post(
    "/api/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"] as string;
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET || ""
        );
      } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const isSubscription = session.metadata?.isSubscription === 'true';
        const amount = session.amount_total ? session.amount_total / 100 : 0;

        if (userId) {
          const userRef = db.collection("users").doc(userId);
          await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            if (doc.exists) {
              if (isSubscription) {
                t.update(userRef, { 
                  "subscription.plan": "pro",
                  "subscription.status": "active",
                  "subscription.currentPeriodEnd": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
              } else {
                const currentBalance = doc.data()?.balance || 0;
                t.update(userRef, { balance: currentBalance + amount });
              }
              
              // Save billing history
              const billingRef = db.collection("billing_history").doc();
              t.set(billingRef, {
                userId,
                amount,
                type: isSubscription ? 'subscription' : 'topup',
                status: 'paid',
                date: new Date().toISOString(),
                invoiceId: session.id
              });
            }
          });
          console.log(`${isSubscription ? 'Subscription activated' : 'Added $' + amount} for user ${userId}`);
        }
      }

      res.json({ received: true });
    }
  );

  app.use(express.json());
  
  // API routes
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, body, userId } = req.body;
    try {
      if (!userId) throw new Error("userId is required");
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      const gmailUser = userData?.gmailUser || process.env.GMAIL_USER;
      const gmailPass = userData?.gmailPass || process.env.GMAIL_PASS;

      if (!gmailUser || !gmailPass) {
        throw new Error("Gmail credentials not configured for this user");
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from: gmailUser,
        to,
        subject,
        text: body,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Email error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.all("/api/workflow/trigger/:webhookId", async (req, res) => {
    const { webhookId } = req.params;
    const bodyData = req.body;
    try {
      const workflowsRef = db.collection("workflows");
      const snapshot = await workflowsRef.get();
      let targetWorkflow: any = null;

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.steps && data.steps.some((s: any) => s.type === 'trigger_webhook' && s.config.webhookId === webhookId)) {
          targetWorkflow = { id: doc.id, ...data };
        }
      });

      if (!targetWorkflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const userDoc = await db.collection("users").doc(targetWorkflow.ownerId).get();
      const userData = userDoc.data();
      const gmailUser = userData?.gmailUser || process.env.GMAIL_USER;
      const gmailPass = userData?.gmailPass || process.env.GMAIL_PASS;
      const userGeminiKey = userData?.geminiApiKey || process.env.GEMINI_API_KEY;

      console.log(`Triggered workflow: ${targetWorkflow.name}`);
      let lastOutput = bodyData ? JSON.stringify(bodyData) : "Webhook triggered";

      // Create workflow run record
      const runRef = await db.collection("workflowRuns").add({
        workflowId: targetWorkflow.id,
        workflowName: targetWorkflow.name,
        userId: targetWorkflow.ownerId,
        status: 'running',
        steps: targetWorkflow.steps.map((s: any) => ({
          type: s.type,
          status: 'pending',
          startTime: new Date().toISOString(),
          endTime: '',
          output: '',
          error: ''
        })),
        startTime: new Date().toISOString(),
        totalCost: 0
      });

      const updatedSteps = targetWorkflow.steps.map((s: any) => ({
        type: s.type,
        status: 'pending',
        startTime: new Date().toISOString(),
        endTime: '',
        output: '',
        error: ''
      }));

      try {
        // Simple execution engine for backend triggers
        for (let i = 0; i < targetWorkflow.steps.length; i++) {
          const step = targetWorkflow.steps[i];
          updatedSteps[i].status = 'pending';
          await runRef.update({ steps: updatedSteps });

          try {
            if (step.type === 'action_email' && gmailUser && gmailPass) {
              const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailPass },
              });

              await transporter.sendMail({
                from: gmailUser,
                to: step.config.to,
                subject: step.config.subject,
                text: step.config.body.replace('{{output}}', lastOutput),
              });
              lastOutput = `Email sent to ${step.config.to}`;
              updatedSteps[i].output = lastOutput;
            } else if (step.type === 'agent_call') {
              console.log(`Agent call requested in backend for agent: ${step.config.agentId}`);
              const agentDoc = await db.collection("agents").doc(step.config.agentId).get();
              if (agentDoc.exists) {
                const agentData = agentDoc.data();
                const apiKey = agentData?.apiKey || userGeminiKey;
                if (apiKey) {
                  const genAI = new GoogleGenAI({ apiKey });
                  
                  const geminiTools: any[] = [];
                  if (agentData?.tools?.includes('web_search')) {
                    geminiTools.push({ googleSearch: {} });
                  }
                  if (agentData?.tools?.includes('code_exec')) {
                    geminiTools.push({ codeExecution: {} });
                  }

                  const config: any = {
                    systemInstruction: agentData?.systemInstruction || "You are a helpful assistant.",
                  };

                  if (geminiTools.length > 0) {
                    config.tools = geminiTools;
                  }

                  if (agentData?.tools?.includes('image_gen') && agentData?.toolConfig?.image_gen) {
                    config.imageConfig = {
                      aspectRatio: agentData.toolConfig.image_gen.aspectRatio,
                      imageSize: agentData.toolConfig.image_gen.imageSize,
                    };
                  }

                  const result = await genAI.models.generateContent({
                    model: agentData?.model || "gemini-3-flash-preview",
                    contents: lastOutput,
                    config: config
                  });
                  
                  // Handle potential image output
                  const imagePart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
                  if (imagePart) {
                    lastOutput = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                  } else {
                    lastOutput = result.text || "No response from agent";
                  }
                  updatedSteps[i].output = lastOutput;
                }
              }
            } else if (step.type === 'trigger_webhook') {
              updatedSteps[i].output = lastOutput;
            }
            updatedSteps[i].status = 'success';
          } catch (stepError: any) {
            updatedSteps[i].status = 'error';
            updatedSteps[i].error = stepError.message;
            await runRef.update({ steps: updatedSteps, status: 'error', endTime: new Date().toISOString() });
            throw stepError;
          }
          updatedSteps[i].endTime = new Date().toISOString();
          await runRef.update({ steps: updatedSteps });
        }
        await runRef.update({ status: 'success', endTime: new Date().toISOString() });
      } catch (error) {
        console.error("Workflow execution failed:", error);
      }

      res.json({ success: true, message: `Workflow '${targetWorkflow.name}' executed.` });
    } catch (error: any) {
      console.error("Workflow trigger error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agent/call/:agentId", async (req, res) => {
    const { agentId } = req.params;
    const { prompt, userId } = req.body;

    try {
      if (!userId) return res.status(400).json({ error: "userId is required" });
      
      const agentDoc = await db.collection("agents").doc(agentId).get();
      if (!agentDoc.exists) return res.status(404).json({ error: "Agent not found" });
      
      const agentData = agentDoc.data();
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      const apiKey = agentData?.apiKey || userData?.geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: "Gemini API key not configured" });

      const genAI = new GoogleGenAI({ apiKey });
      
      const geminiTools: any[] = [];
      if (agentData?.tools?.includes('web_search')) {
        geminiTools.push({ googleSearch: {} });
      }
      if (agentData?.tools?.includes('code_exec')) {
        geminiTools.push({ codeExecution: {} });
      }

      const config: any = {
        systemInstruction: agentData?.systemInstruction || "You are a helpful assistant.",
      };

      if (geminiTools.length > 0) {
        config.tools = geminiTools;
      }

      if (agentData?.tools?.includes('image_gen') && agentData?.toolConfig?.image_gen) {
        config.imageConfig = {
          aspectRatio: agentData.toolConfig.image_gen.aspectRatio,
          imageSize: agentData.toolConfig.image_gen.imageSize,
        };
      }

      const result = await genAI.models.generateContent({
        model: agentData?.model || "gemini-3-flash-preview",
        contents: prompt,
        config: config
      });

      // Handle potential image output
      const imagePart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (imagePart) {
        res.json({ response: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` });
      } else {
        res.json({ response: result.text });
      }
    } catch (error: any) {
      console.error("Agent API error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-checkout-session", async (req, res) => {
    const { userId, amount, isSubscription } = req.body;

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: isSubscription ? "AgentFlow Pro Subscription" : "AgentFlow Credits",
              },
              unit_amount: amount * 100,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.APP_URL || "http://localhost:3000"}?payment=success`,
        cancel_url: `${process.env.APP_URL || "http://localhost:3000"}?payment=cancel`,
        metadata: {
          userId,
          isSubscription: isSubscription ? 'true' : 'false'
        },
      });

      res.json({ id: session.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
