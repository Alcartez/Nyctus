// Copyright (c) 2026 Alakto Choudhury
// This file is part of Nyctus.
// Nyctus is dual-licensed under the AGPLv3 and a Commercial License.

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nyctus_core_lib::run()
}
