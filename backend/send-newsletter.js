import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch';

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Check if running in test mode
const TEST_MODE = process.argv.includes('--test');

// =====================================================
// CONTENT GENERATION FUNCTIONS
// =====================================================

async function getQuoteOfTheDay() {
  try {
    const response = await fetch('https://zenquotes.io/api/today');
    const data = await response.json();
    
    if (data && data[0]) {
      return {
        text: data[0].q,
        author: data[0].a
      };
    }
  } catch (error) {
    console.error('Error fetching quote:', error);
  }
  
  // Fallback quote
  return {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs"
  };
}

async function getTriviaQuestions() {
  try {
    // Fetch 10 questions from Open Trivia DB (mix of difficulties)
    const response = await fetch('https://opentdb.com/api.php?amount=10&type=multiple');
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return data.results.map((q, index) => {
        // Decode HTML entities
        const decodeHTML = (html) => {
          const txt = new DOMParser ? new DOMParser().parseFromString(html, 'text/html') : { documentElement: { textContent: html }};
          return txt.documentElement.textContent || html;
        };
        
        // Simple decode for Node.js environment
        const decode = (str) => str
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        
        const allAnswers = [...q.incorrect_answers, q.correct_answer]
          .sort(() => Math.random() - 0.5);
        
        return {
          number: index + 1,
          question: decode(q.question),
          category: decode(q.category),
          difficulty: q.difficulty,
          options: allAnswers.map(a => decode(a)),
          correctAnswer: decode(q.correct_answer)
        };
      });
    }
  } catch (error) {
    console.error('Error fetching trivia:', error);
  }
  
  // Fallback trivia
  return [{
    number: 1,
    question: "What is the capital of France?",
    category: "Geography",
    difficulty: "easy",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctAnswer: "Paris"
  }];
}

async function getAINews() {
  try {
    const prompt = `You are a tech news curator. Generate exactly 5 AI news summaries.

Return ONLY valid JSON (no markdown, no code blocks, no extra text):

[
  {
    "headline": "headline text",
    "summary": "summary text", 
    "why_it_matters": "importance text"
  }
]

Requirements:
- Exactly 5 news items
- Headlines: max 15 words
- Summaries: 2-3 sentences, max 100 words each
- Focus on: AI breakthroughs, products, policy, research, industry news
- Make it engaging for tech readers`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    let responseText = message.content[0].text.trim();
    
    // Remove any markdown formatting
    responseText = responseText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // Try to parse JSON
    let newsItems;
    
    // First try: direct parse
    try {
      newsItems = JSON.parse(responseText);
    } catch (e) {
      // Second try: extract array from text
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) {
        newsItems = JSON.parse(match[0]);
      } else {
        throw new Error('Could not find JSON array in response');
      }
    }
    
    // Validate we got an array with items
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      throw new Error(`Expected array of news items, got: ${typeof newsItems}`);
    }
    
    // Ensure exactly 5 items
    if (newsItems.length < 5) {
      console.log(`   ⚠️ Only got ${newsItems.length} AI news items, padding with fallbacks`);
      while (newsItems.length < 5) {
        newsItems.push({
          headline: "AI Development Continues Across Multiple Sectors",
          summary: "The artificial intelligence industry continues to evolve with new breakthroughs in machine learning, natural language processing, and computer vision applications.",
          why_it_matters: "These advances are transforming how businesses operate and how people interact with technology."
        });
      }
    }
    
    const finalNews = newsItems.slice(0, 5);
    console.log(`   ✓ Generated ${finalNews.length} AI news items successfully`);
    return finalNews;
    
  } catch (error) {
    console.error('   ✗ Error generating AI news:', error.message);
    console.log('   → Using fallback AI news (5 items)');
    
    // Return 5 fallback items (not just 1!)
    return [
      {
        headline: "AI Models Achieve New Benchmarks in Reasoning Tasks",
        summary: "Latest AI systems demonstrate improved performance on complex reasoning challenges. Models show enhanced ability to solve multi-step problems and provide more accurate explanations for their conclusions.",
        why_it_matters: "Better reasoning capabilities bring AI closer to handling real-world business and scientific challenges."
      },
      {
        headline: "Enterprise AI Adoption Accelerates Globally",
        summary: "Companies worldwide are integrating AI into core operations, from customer service to product development. Industry reports show significant ROI and productivity gains across sectors.",
        why_it_matters: "AI is becoming essential infrastructure for competitive businesses in the modern economy."
      },
      {
        headline: "AI Safety Research Receives Increased Funding",
        summary: "Major tech companies and research institutions are expanding AI safety teams. Focus areas include alignment, interpretability, and developing frameworks for responsible AI deployment.",
        why_it_matters: "Ensuring AI systems remain safe and beneficial is critical as they become more powerful and widespread."
      },
      {
        headline: "Open Source AI Community Delivers Major Updates",
        summary: "Community-developed AI models continue to challenge proprietary systems with competitive performance. New tools make it easier for developers to build and deploy AI applications without vendor lock-in.",
        why_it_matters: "Democratized AI access enables innovation from startups and researchers worldwide."
      },
      {
        headline: "Global AI Governance Frameworks Take Shape",
        summary: "Governments and international bodies advance AI policy discussions. New regulations aim to balance innovation with safety, privacy, and ethical considerations.",
        why_it_matters: "Clear regulatory frameworks help guide responsible AI development and build public trust."
      }
    ];
  }
}

// =====================================================
// EMAIL TEMPLATE
// =====================================================

function createEmailHTML(content, unsubscribeUrl) {
  const { quote, trivia, aiNews } = content;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Good Vibes</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">☀️ Daily Good Vibes</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.95;">${new Date().toDateString()}</p>
            </td>
          </tr>
          
          <!-- Quote Section -->
          <tr>
            <td style="padding: 30px; background-color: #f8f9fa;">
              <h2 style="color: #1a535c; margin: 0 0 15px 0; font-size: 24px;">💡 Quote of the Day</h2>
              <blockquote style="margin: 0; padding: 20px; background-color: #ffffff; border-left: 4px solid #4ECDC4; border-radius: 5px;">
                <p style="font-size: 18px; font-style: italic; color: #333; margin: 0 0 10px 0; line-height: 1.6;">"${quote.text}"</p>
                <p style="text-align: right; color: #666; margin: 0; font-size: 16px;">— ${quote.author}</p>
              </blockquote>
            </td>
          </tr>
          
          <!-- Trivia Section -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #1a535c; margin: 0 0 20px 0; font-size: 24px;">🧠 Today's Trivia Challenge</h2>
              ${trivia.map(q => `
                <div style="margin-bottom: 25px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                  <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;"><strong>Question ${q.number}</strong> • ${q.category} • ${q.difficulty}</p>
                  <p style="margin: 0 0 15px 0; color: #333; font-size: 16px; font-weight: 500;">${q.question}</p>
                  ${q.options.map((opt, i) => `
                    <p style="margin: 5px 0; padding: 10px; background-color: #ffffff; border-radius: 5px; color: #333;">
                      ${String.fromCharCode(65 + i)}. ${opt}
                    </p>
                  `).join('')}
                  <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; color: #4ECDC4; font-weight: bold;">Show Answer</summary>
                    <p style="margin: 10px 0 0 0; padding: 15px; background-color: #d4f4dd; border-radius: 5px; color: #1a535c;">
                      ✓ <strong>${q.correctAnswer}</strong>
                    </p>
                  </details>
                </div>
              `).join('')}
            </td>
          </tr>
          
          <!-- AI News Section -->
          <tr>
            <td style="padding: 30px; background-color: #f8f9fa;">
              <h2 style="color: #1a535c; margin: 0 0 20px 0; font-size: 24px;">🤖 Top 5 AI News</h2>
              ${aiNews.map((news, index) => `
                <div style="margin-bottom: 20px; padding: 20px; background-color: #ffffff; border-radius: 8px; border-left: 4px solid #4ECDC4;">
                  <h3 style="margin: 0 0 10px 0; color: #1a535c; font-size: 18px;">${index + 1}. ${news.headline}</h3>
                  <p style="margin: 0 0 10px 0; color: #333; line-height: 1.6;">${news.summary}</p>
                  <p style="margin: 0; color: #666; font-size: 14px; font-style: italic;"><strong>Why it matters:</strong> ${news.why_it_matters}</p>
                </div>
              `).join('')}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #1a535c; color: #ffffff;">
              <p style="margin: 0 0 10px 0; font-size: 14px;">You're receiving this because you subscribed to Daily Good Vibes</p>
              <p style="margin: 0; font-size: 14px;">
                <a href="${unsubscribeUrl}" style="color: #4ECDC4; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// =====================================================
// MAIN FUNCTION
// =====================================================

async function sendDailyNewsletter() {
  console.log('🚀 Starting Daily Good Vibes newsletter generation...\n');
  
  try {
    // 1. Generate content
    console.log('📝 Generating content...');
    const [quote, trivia, aiNews] = await Promise.all([
      getQuoteOfTheDay(),
      getTriviaQuestions(),
      getAINews()
    ]);
    
    console.log('✅ Content generated successfully');
    console.log(`   - Quote: "${quote.text.substring(0, 50)}..."`);
    console.log(`   - Trivia: ${trivia.length} questions`);
    console.log(`   - AI News: ${aiNews.length} stories\n`);
    
    // 2. Get active subscribers
    console.log('👥 Fetching active subscribers...');
    const { data: subscribers, error: dbError } = await supabase
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('is_active', true)
    .order('subscribed_at', { ascending: true }) // Get oldest subscriber first
    .limit(100); // Limit to 100 for free tier
    
    if (dbError) throw dbError;
    
    if (!subscribers || subscribers.length === 0) {
      console.log('⚠️  No active subscribers found');
      return;
    }
    
    console.log(`✅ Found ${subscribers.length} active subscribers\n`);
    
    if (TEST_MODE) {
      console.log('🧪 TEST MODE - Sending to first subscriber only');
      subscribers.length = 1;
    }
    
    // 3. Send emails
    console.log('📧 Sending newsletters...');
    let successCount = 0;
    let errorCount = 0;
    
    for (const subscriber of subscribers) {
      try {
        const unsubscribeUrl = `${process.env.WEBSITE_URL}/unsubscribe.html?token=${subscriber.unsubscribe_token}`;
        
        const emailHTML = createEmailHTML(
          { quote, trivia, aiNews },
          unsubscribeUrl
        );

        await resend.emails.send({
          from: 'Daily Good Vibes <onboarding@resend.dev>',
          to: subscriber.email,
          subject: `☀️ Your Daily Good Vibes - ${new Date().toLocaleDateString()}`,
          html: emailHTML
        });
        
        successCount++;
        console.log(`   ✓ Sent to ${subscriber.email}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`   ✗ Failed to send to ${subscriber.email}:`, error.message);
      }
    }
    
    console.log(`\n✅ Newsletter sent successfully!`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Error sending newsletter:', error);
    throw error;
  }
}

// Run the script
sendDailyNewsletter()
  .then(() => {
    console.log('\n🎉 Process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Process failed:', error);
    process.exit(1);
  });