# Gugee native fee engine

The fee engine contains the deterministic money rules used by the wallet:

- Deposit: $1 fee.
- Withdraw: $1 for every complete $20.
- Buy crypto: $0.10 fee.
- Sell crypto: $0.10 fee.
- Minimum withdrawal: $20 is enforced by the API layer.

The PostgreSQL transaction remains the source of truth for balances. The C++ program is intentionally deterministic and has no network or payment credentials.

Build on Render/Linux:

g++ -O3 -std=c++17 cpp/fee_engine.cpp -o fee-engine

Example:

echo "withdraw 100" | ./fee-engine

The API still validates every amount and performs balance changes atomically in PostgreSQL.
