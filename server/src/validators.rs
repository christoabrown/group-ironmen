use lazy_static::lazy_static;
use regex::Regex;

#[cfg(test)]
mod valid_name_tests {
    use super::*;

    #[test]
    fn valid_names() {
        let valid_names = [
            "test",
            "with space",
            "with 1234",
            "123",
            "with-dash",
            "dash-and space",
            "CAPITAL LETTERS",
            "MiXeD case-123",
            "0123456789",
            "underscore_name",
        ];

        for name in valid_names {
            assert!(valid_name(name), "{} should have been a valid name", name);
        }
    }

    #[test]
    fn invalid_names() {
        let invalid_names = [
            "@SHARED",
            "invalid!",
            "@",
            "-=+[];'./,<>?\"\\|`~",
            "=",
            "+",
            "[",
            "]",
            ";",
            "'",
            ".",
            "/",
            ",",
            "<",
            ">",
            "?",
            "\"",
            "\\",
            "|",
            "`",
            "~",
            "",
            " ",
        ];

        for name in invalid_names {
            assert!(
                !valid_name(name),
                "{} should have been an invalid name",
                name
            );
        }
    }
}

pub fn valid_name(name: &str) -> bool {
    lazy_static! {
        static ref NAME_RE: Regex = Regex::new("[^A-Za-z 0-9-_]").unwrap();
    }

    let len = name.trim().len();
    len >= 1 && len <= 16 && name.is_ascii() && !NAME_RE.is_match(name)
}
