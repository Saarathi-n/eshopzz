# eShopzz

An intelligent e-commerce price comparison aggregator that compares products across Amazon and Flipkart.

## Features
- **Price Aggregation**: Scrapes real-time data from Amazon and Flipkart.
- **Smart Chatbot**: Powered by NVIDIA AI (Kimi-K2) to help you find the best deals.
- **Comparison Table**: Easily compare prices and ratings of similar products.
- **User Authentication**: Secure login and cart management with JWT and Bcrypt.
- **Modern UI**: Built with React, Tailwind CSS, and Framer Motion.

## Project Structure
- `backend/`: Flask API with SQLAlchemy and Selenium scraping.
- `frontend/`: React + Vite application.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend Setup
1. Navigate to `backend/`
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Or `.venv\Scripts\activate` on Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the API:
   ```bash
   python app.py
   ```

### Frontend Setup
1. Navigate to `frontend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## License
MIT
