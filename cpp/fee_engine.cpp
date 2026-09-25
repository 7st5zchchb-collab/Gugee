#include <cmath>
#include <iomanip>
#include <iostream>
#include <string>

static double deposit_fee(double amount) {
    return amount > 0.0 ? 1.0 : 0.0;
}

static double withdraw_fee(double amount) {
    if (amount <= 0.0) return 0.0;
    return std::floor(amount / 20.0);
}

static double trade_fee() {
    return 0.10;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    std::string operation;
    double amount = 0.0;

    if (!(std::cin >> operation >> amount) || !std::isfinite(amount) || amount <= 0.0) {
        std::cerr << "invalid_input\n";
        return 2;
    }

    double fee = 0.0;
    double net = amount;

    if (operation == "deposit") {
        fee = deposit_fee(amount);
        net = amount - fee;
    } else if (operation == "withdraw") {
        fee = withdraw_fee(amount);
        net = amount - fee;
    } else if (operation == "buy" || operation == "sell") {
        fee = trade_fee();
        net = operation == "sell" ? amount - fee : amount + fee;
    } else {
        std::cerr << "invalid_operation\n";
        return 3;
    }

    std::cout << std::fixed << std::setprecision(10);
    std::cout << fee << " " << net << "\n";
    return 0;
}
